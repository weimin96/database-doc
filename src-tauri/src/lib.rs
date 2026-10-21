mod ai;
mod credentials;
mod database;
mod models;
mod workspace;
use models::*;
use tauri::Manager;

fn credentials_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|_| "无法定位应用配置目录")?
        .join("secrets"))
}

async fn read_saved_password(
    directory: std::path::PathBuf,
    id: String,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || credentials::read(&directory, &id))
        .await
        .map_err(|_| "读取本地加密凭据时发生异常")?
}

async fn update_saved_password(
    directory: std::path::PathBuf,
    id: String,
    password: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || match password {
        Some(password) => credentials::save(&directory, &id, &password),
        None => credentials::remove(&directory, &id),
    })
    .await
    .map_err(|_| "保存本地加密凭据时发生异常")?
}

#[tauri::command]
async fn connect_database(
    mut options: ConnectionOptions,
    credential_id: Option<String>,
    remember_password: bool,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<TableInfo>, String> {
    if let Some(id) = &credential_id {
        // 禁止修改目标库/账户后静默复用旧连接密码。
        let profile = load_preferences(app.clone())?
            .connections
            .into_iter()
            .find(|value| value.id == *id);
        if options.password.is_empty()
            && profile.as_ref().is_some_and(|profile| {
                profile.host == options.host
                    && profile.port == options.port
                    && profile.database == options.database
                    && profile.username == options.username
                    && profile.sslmode == options.sslmode
            })
        {
            if let Some(password) =
                read_saved_password(credentials_directory(&app)?, id.clone()).await?
            {
                options.password = password;
            }
        }
    }
    let stored_password = remember_password.then(|| options.password.clone());
    let mut guard = state.0.lock().await;
    let session = database::connect(options).await?;
    let mut connection = session.pool.acquire().await.map_err(db_error)?;
    let result = database::tables(&mut connection, &[]).await?;
    drop(connection);
    if let Some(id) = &credential_id {
        // 仅在成功连接且元数据查询成功后保存密码；明文不会进入 JSON。
        update_saved_password(credentials_directory(&app)?, id.clone(), stored_password).await?;
    }
    if let Some(previous) = guard.take() {
        previous.pool.close().await;
    }
    *guard = Some(session);
    Ok(result)
}
#[tauri::command]
async fn connect_saved_database(
    connection_id: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<Vec<TableInfo>>, String> {
    let profile = load_preferences(app.clone())?
        .connections
        .into_iter()
        .find(|item| item.id == connection_id)
        .ok_or("项目关联的数据库配置已不存在，请重新设置连接")?;
    let Some(password) =
        read_saved_password(credentials_directory(&app)?, connection_id.clone()).await?
    else {
        return Ok(None);
    };
    let options = ConnectionOptions {
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        sslmode: profile.sslmode,
        password,
    };
    let mut guard = state.0.lock().await;
    let session = database::connect(options).await?;
    let mut connection = session.pool.acquire().await.map_err(db_error)?;
    let result = database::tables(&mut connection, &[]).await?;
    drop(connection);
    if let Some(previous) = guard.take() {
        previous.pool.close().await;
    }
    *guard = Some(session);
    Ok(Some(result))
}
#[tauri::command]
async fn disconnect_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(session) = state.0.lock().await.take() {
        session.pool.close().await;
    }
    Ok(())
}
#[tauri::command]
async fn read_tables(
    ids: Vec<i64>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TableInfo>, String> {
    let guard = state.0.lock().await;
    let session = guard.as_ref().ok_or("尚未连接数据库")?;
    let mut connection = session.pool.acquire().await.map_err(db_error)?;
    database::tables(&mut connection, &ids).await
}
#[tauri::command]
async fn generate_comments(
    oid: i64,
    settings: AiSettings,
    background: String,
    expected: TableInfo,
    state: tauri::State<'_, AppState>,
) -> Result<Draft, String> {
    let mut guard = state.0.lock().await;
    let session = guard.as_mut().ok_or("尚未连接数据库")?;
    let mut connection = session.pool.acquire().await.map_err(db_error)?;
    let mut tables = database::tables(&mut connection, &[oid]).await?;
    drop(connection);
    if tables.len() != 1 {
        return Err("目标表不存在，请刷新".into());
    }
    if tables[0] != expected {
        return Err("表结构或注释已变化，请刷新后重新确认发送范围".into());
    }
    let draft = ai::generate(settings, tables.remove(0), background).await?;
    session.drafts.retain(|_, old| old.snapshot.oid != oid);
    let view = draft.view.clone();
    session.drafts.insert(view.id.clone(), draft);
    Ok(view)
}
#[tauri::command]
fn validate_ai_settings(settings: AiSettings) -> Result<(), String> {
    ai::endpoint(&settings.base_url)?;
    if settings.model.trim().is_empty() {
        return Err("请输入模型名称".into());
    }
    Ok(())
}
#[tauri::command]
async fn write_comments(
    draft_id: String,
    items: Vec<WriteItem>,
    state: tauri::State<'_, AppState>,
) -> Result<WriteResult, String> {
    let mut guard = state.0.lock().await;
    let session = guard.as_mut().ok_or("尚未连接数据库")?;
    let draft = session
        .drafts
        .remove(&draft_id)
        .ok_or("草稿已失效，请重新生成并审阅")?;
    Ok(database::write(&session.pool, &draft, &items).await)
}

// 手工修改允许编辑已有注释，但必须使用提交编辑时的结构快照；
// 复用 AI 注释写入时的锁表、结构比对、事务和回读逻辑。
#[tauri::command]
async fn save_manual_comment(
    expected: TableInfo,
    target: String,
    comment: String,
    state: tauri::State<'_, AppState>,
) -> Result<WriteResult, String> {
    if !valid_comment(&comment) {
        return Err("注释不能为空、不能包含空字符且不能超过 2000 字".into());
    }
    let position = if target == "table" {
        None
    } else {
        let raw = target.strip_prefix("column:").ok_or("注释目标不合法")?;
        let position: i16 = raw.parse().map_err(|_| "字段位置不合法")?;
        if !expected
            .columns
            .iter()
            .any(|column| column.position == position)
        {
            return Err("字段已发生变化，请刷新结构".into());
        }
        Some(position)
    };
    let guard = state.0.lock().await;
    let session = guard.as_ref().ok_or("尚未连接数据库")?;
    let original = if let Some(position) = position {
        expected
            .columns
            .iter()
            .find(|column| column.position == position)
            .and_then(|column| column.comment.as_deref())
    } else {
        expected.comment.as_deref()
    };
    if original == Some(comment.trim()) {
        return Err("注释内容没有变化".into());
    }
    let mut targets = std::collections::HashMap::new();
    targets.insert(target.clone(), position);
    let draft = StoredDraft {
        view: Draft {
            id: String::new(),
            schema: expected.schema.clone(),
            table: expected.name.clone(),
            suggestions: Vec::new(),
        },
        snapshot: expected,
        targets,
    };
    Ok(database::write(
        &session.pool,
        &draft,
        &[WriteItem {
            id: target,
            comment,
        }],
    )
    .await)
}

// 配置只含非敏感字段，由强类型结构限制可落盘内容。
#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preferences {
    connections: Vec<SavedConnection>,
    ai_url: String,
    ai_model: String,
}
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedConnection {
    id: String,
    label: String,
    host: String,
    port: u16,
    database: String,
    username: String,
    sslmode: String,
}
#[tauri::command]
fn load_preferences(app: tauri::AppHandle) -> Result<Preferences, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法定位应用配置目录")?
        .join("preferences.json");
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "本地配置损坏，请检查 preferences.json".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
        Err(_) => Err("无法读取本地配置".into()),
    }
}
#[tauri::command]
fn save_preferences(preferences: Preferences, app: tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法定位应用配置目录")?;
    std::fs::create_dir_all(&directory).map_err(|_| "无法创建配置目录")?;
    let bytes = serde_json::to_vec_pretty(&preferences).map_err(|_| "配置序列化失败")?;
    let pending = directory.join("preferences.pending");
    std::fs::write(&pending, bytes).map_err(|_| "写入本地配置失败")?;
    std::fs::rename(pending, directory.join("preferences.json"))
        .map_err(|_| "保存本地配置失败".into())
}
#[tauri::command]
async fn list_ai_models(settings: AiSettings) -> Result<Vec<String>, String> {
    ai::list_models(settings).await
}
#[tauri::command]
async fn test_ai_connection(settings: AiSettings) -> Result<(), String> {
    ai::test_connection(settings).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect_database,
            connect_saved_database,
            disconnect_database,
            read_tables,
            generate_comments,
            validate_ai_settings,
            write_comments,
            save_manual_comment,
            load_preferences,
            save_preferences,
            list_ai_models,
            test_ai_connection,
            workspace::load_workspace,
            workspace::save_workspace,
            workspace::list_templates,
            workspace::import_template,
            workspace::read_template,
            workspace::delete_template
        ])
        .run(tauri::generate_context!())
        .expect("桌面应用启动失败");
}
#[cfg(test)]
mod checks;
