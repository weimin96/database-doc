use serde::{Deserialize, Serialize};
use std::{fs, io, path::PathBuf};
use tauri::Manager;

const BUILTIN_ID: &str = "builtin";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    id: String,
    name: String,
    organization: String,
    version: String,
    date: String,
    overview: String,
    connection_id: Option<String>,
    template_id: String,
    selected_tables: Vec<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceStore {
    projects: Vec<Project>,
    active_project_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateEntry {
    id: String,
    name: String,
    builtin: bool,
}

fn config_path(app: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|_| "无法定位应用配置目录")?
        .join(filename))
}

fn read_json<T: serde::de::DeserializeOwned + Default>(path: &PathBuf) -> Result<T, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| format!("配置文件 {} 格式不正确", path.display())),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(format!("读取本地配置失败：{e}")),
    }
}

fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建配置目录失败：{e}"))?;
    }
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| "配置序列化失败")?;
    let pending = path.with_extension("pending");
    fs::write(&pending, bytes).map_err(|e| format!("写入配置失败：{e}"))?;
    fs::rename(&pending, path).map_err(|e| format!("保存配置失败：{e}"))
}

#[tauri::command]
pub fn load_workspace(app: tauri::AppHandle) -> Result<WorkspaceStore, String> {
    read_json(&config_path(&app, "workspace.json")?)
}

#[tauri::command]
pub fn save_workspace(workspace: WorkspaceStore, app: tauri::AppHandle) -> Result<(), String> {
    if workspace.projects.len() > 500 {
        return Err("项目数量超过上限".into());
    }
    let mut ids = std::collections::HashSet::new();
    for project in &workspace.projects {
        if project.id.is_empty()
            || !ids.insert(&project.id)
            || project.name.len() > 200
            || project.selected_tables.len() > 20_000
        {
            return Err("项目配置包含无效或重复的标识".into());
        }
    }
    if !workspace.active_project_id.is_empty() && !ids.contains(&workspace.active_project_id) {
        return Err("当前项目不存在".into());
    }
    write_json(&config_path(&app, "workspace.json")?, &workspace)
}

fn templates_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    config_path(app, "templates")
}

fn custom_templates(app: &tauri::AppHandle) -> Result<Vec<TemplateEntry>, String> {
    read_json(&config_path(app, "templates.json")?)
}

#[tauri::command]
pub fn list_templates(app: tauri::AppHandle) -> Result<Vec<TemplateEntry>, String> {
    let mut result = vec![TemplateEntry {
        id: BUILTIN_ID.to_string(),
        name: "数据库设计说明书（内置）".to_string(),
        builtin: true,
    }];
    let saved = custom_templates(&app)?;
    for entry in saved {
        if entry.id == BUILTIN_ID || uuid::Uuid::parse_str(&entry.id).is_err() {
            return Err("模板索引包含无效标识".into());
        }
        if !templates_path(&app)?
            .join(format!("{}.docx", entry.id))
            .is_file()
        {
            return Err(format!("模板文件缺失：{}", entry.name));
        }
        result.push(entry);
    }
    Ok(result)
}

#[tauri::command]
pub fn import_template(
    name: String,
    bytes: Vec<u8>,
    app: tauri::AppHandle,
) -> Result<TemplateEntry, String> {
    let name = name.trim().trim_end_matches(".docx").trim();
    if name.is_empty()
        || name.chars().count() > 80
        || bytes.len() > 20 * 1024 * 1024
        || bytes.len() < 4
        || !bytes.starts_with(b"PK\x03\x04")
    {
        return Err("模板无效：仅允许 20 MB 以内的 DOCX 文件".into());
    }
    let mut saved = custom_templates(&app)?;
    if saved.len() >= 30 {
        return Err("最多保存 30 个自定义模板".into());
    }
    let entry = TemplateEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        builtin: false,
    };
    let directory = templates_path(&app)?;
    fs::create_dir_all(&directory).map_err(|e| format!("无法创建模板目录：{e}"))?;
    let target = directory.join(format!("{}.docx", entry.id));
    fs::write(&target, bytes).map_err(|e| format!("保存模板失败：{e}"))?;
    saved.push(entry.clone());
    if let Err(error) = write_json(&config_path(&app, "templates.json")?, &saved) {
        let _ = fs::remove_file(target);
        return Err(error);
    }
    Ok(entry)
}

#[tauri::command]
pub fn read_template(id: String, app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    if !custom_templates(&app)?
        .iter()
        .any(|template| template.id == id)
    {
        return Err("模板不存在，请重新选择".into());
    }
    fs::read(templates_path(&app)?.join(format!("{id}.docx")))
        .map_err(|e| format!("读取模板失败：{e}"))
}

#[tauri::command]
pub fn delete_template(id: String, app: tauri::AppHandle) -> Result<(), String> {
    if id == BUILTIN_ID {
        return Err("内置模板不可删除".into());
    }
    let mut saved = custom_templates(&app)?;
    if !saved.iter().any(|template| template.id == id) {
        return Err("模板不存在".into());
    }
    let target = templates_path(&app)?.join(format!("{id}.docx"));
    fs::remove_file(target).map_err(|e| format!("删除模板文件失败：{e}"))?;
    saved.retain(|item| item.id != id);
    write_json(&config_path(&app, "templates.json")?, &saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_storage_roundtrip() {
        let path = std::env::temp_dir().join(format!(
            "database-doc-workspace-{}.json",
            uuid::Uuid::new_v4()
        ));
        let workspace = WorkspaceStore {
            active_project_id: "project-1".into(),
            projects: vec![Project {
                id: "project-1".into(),
                name: "项目文档".into(),
                organization: "单位".into(),
                version: "V2".into(),
                date: "2026-10-20".into(),
                overview: "说明".into(),
                connection_id: Some("connection-1".into()),
                template_id: "builtin".into(),
                selected_tables: vec!["[\"public\",\"accounts\"]".into()],
            }],
        };
        write_json(&path, &workspace).expect("save workspace");
        let restored: WorkspaceStore = read_json(&path).expect("load workspace");
        assert_eq!(restored.active_project_id, "project-1");
        assert_eq!(restored.projects[0].name, "项目文档");
        assert_eq!(restored.projects[0].template_id, "builtin");
        assert_eq!(
            restored.projects[0].selected_tables,
            vec!["[\"public\",\"accounts\"]"]
        );
        assert_eq!(
            restored.projects[0].connection_id.as_deref(),
            Some("connection-1")
        );
        fs::remove_file(path).expect("clean fixture");
    }
}
