use crate::models::*;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
    Connection, PgConnection, Row,
};
use std::time::Duration;

pub async fn connect(options: ConnectionOptions) -> Result<Session, String> {
    if options.host.trim().is_empty()
        || options.database.trim().is_empty()
        || options.username.trim().is_empty()
        || options.port == 0
    {
        return Err("请完整填写数据库连接信息".into());
    }
    let ssl = match options.sslmode.as_str() {
        "disable" => PgSslMode::Disable,
        "require" => PgSslMode::Require,
        "verify-full" => PgSslMode::VerifyFull,
        _ => return Err("不支持的 SSL 模式".into()),
    };
    let config = PgConnectOptions::new_without_pgpass()
        .host(&options.host)
        .port(options.port)
        .database(&options.database)
        .username(&options.username)
        .password(&options.password)
        .ssl_mode(ssl)
        .application_name("Database Doc");
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .acquire_timeout(Duration::from_secs(10))
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("SET statement_timeout = '15s'")
                    .execute(&mut *connection)
                    .await?;
                sqlx::query("SET lock_timeout = '3s'")
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect_with(config)
        .await
        .map_err(db_error)?;
    Ok(Session {
        pool,
        drafts: Default::default(),
    })
}

pub async fn tables(connection: &mut PgConnection, ids: &[i64]) -> Result<Vec<TableInfo>, String> {
    let rows=sqlx::query(r#"
SELECT n.nspname AS schema,c.relname AS name,c.oid::bigint AS oid,
       obj_description(c.oid,'pg_class') AS comment,
       count(a.attnum)::bigint AS column_count,
       coalesce(jsonb_agg(jsonb_build_object(
           'name',a.attname,'position',a.attnum,'dataType',format_type(a.atttypid,a.atttypmod),
           'primaryKey',EXISTS(SELECT 1 FROM pg_constraint p WHERE p.conrelid=c.oid AND p.contype='p' AND a.attnum=ANY(p.conkey)),
           'notNull',a.attnotnull,'defaultValue',pg_get_expr(d.adbin,d.adrelid),
           'comment',col_description(c.oid,a.attnum),'identity',a.attidentity::text,'generated',a.attgenerated::text
       ) ORDER BY a.attnum) FILTER (WHERE a.attnum IS NOT NULL),'[]'::jsonb) AS columns
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
  AND (cardinality($1::bigint[])=0 OR c.oid::bigint=ANY($1))
GROUP BY n.nspname,c.relname,c.oid ORDER BY n.nspname,c.relname
"#).bind(ids).fetch_all(connection).await.map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            let sqlx::types::Json(columns) = row
                .try_get::<sqlx::types::Json<Vec<ColumnInfo>>, _>("columns")
                .map_err(db_error)?;
            Ok(TableInfo {
                schema: row.try_get("schema").map_err(db_error)?,
                name: row.try_get("name").map_err(db_error)?,
                oid: row.try_get("oid").map_err(db_error)?,
                comment: row.try_get("comment").map_err(db_error)?,
                column_count: row.try_get("column_count").map_err(db_error)?,
                columns,
            })
        })
        .collect()
}

pub async fn write(pool: &sqlx::PgPool, draft: &StoredDraft, items: &[WriteItem]) -> WriteResult {
    let mut result = WriteResult {
        status: "failed".into(),
        message: String::new(),
        schema: draft.snapshot.schema.clone(),
        table: draft.snapshot.name.clone(),
        actual: None,
    };
    match write_transaction(pool, draft, items).await {
        Ok(()) => {
            result.status = "committed".into();
            result.message = "已提交并回读验证".into();
            match pool.acquire().await {
                Ok(mut connection) => match tables(&mut connection, &[draft.snapshot.oid]).await {
                    Ok(mut actual) if actual.len() == 1 => {
                        let actual = actual.remove(0);
                        let matches = items.iter().all(|item| {
                            let position = draft.targets.get(&item.id);
                            let value = match position {
                                Some(None) => actual.comment.as_deref(),
                                Some(Some(position)) => actual
                                    .columns
                                    .iter()
                                    .find(|c| c.position == *position)
                                    .and_then(|c| c.comment.as_deref()),
                                None => None,
                            };
                            value == Some(item.comment.trim())
                        });
                        if matches
                            && actual.schema == draft.snapshot.schema
                            && actual.name == draft.snapshot.name
                        {
                            result.actual = Some(actual)
                        } else {
                            result.status = "uncertain".into();
                            result.message = "已提交，但回读状态已变化，需刷新核实".into();
                        }
                    }
                    _ => {
                        result.status = "uncertain".into();
                        result.message = "已提交，但回读失败，需重新连接核实".into();
                    }
                },
                Err(_) => {
                    result.status = "uncertain".into();
                    result.message = "已提交，但回读连接失败，需重新连接核实".into();
                }
            }
        }
        Err((status, message)) => {
            result.status = status;
            result.message = message;
        }
    }
    result
}

async fn write_transaction(
    pool: &sqlx::PgPool,
    draft: &StoredDraft,
    items: &[WriteItem],
) -> Result<(), (String, String)> {
    if items.is_empty() {
        return Err(("failed".into(), "未选择注释".into()));
    }
    let mut seen = std::collections::HashSet::new();
    for item in items {
        if !draft.targets.contains_key(&item.id)
            || !seen.insert(&item.id)
            || !valid_comment(&item.comment)
        {
            return Err(("failed".into(), "注释目标或内容不合法，请重新审阅".into()));
        }
    }
    let map = |e| ("failed".into(), db_error(e));
    let mut connection = pool.acquire().await.map_err(map)?;
    let mut transaction = connection.begin().await.map_err(map)?;
    let lock: String = sqlx::query_scalar(
        "SELECT format('LOCK TABLE ONLY %I.%I IN SHARE UPDATE EXCLUSIVE MODE',$1::text,$2::text)",
    )
    .bind(&draft.snapshot.schema)
    .bind(&draft.snapshot.name)
    .fetch_one(&mut *transaction)
    .await
    .map_err(map)?;
    sqlx::query(&lock)
        .execute(&mut *transaction)
        .await
        .map_err(map)?;
    let actual = tables(&mut transaction, &[draft.snapshot.oid])
        .await
        .map_err(|e| ("failed".into(), e))?;
    if actual.first() != Some(&draft.snapshot) {
        transaction.rollback().await.map_err(map)?;
        return Err((
            "conflict".into(),
            "表结构或注释已变化，请刷新并重新审阅".into(),
        ));
    }
    for item in items {
        let column = draft.targets[&item.id].and_then(|position| {
            draft
                .snapshot
                .columns
                .iter()
                .find(|c| c.position == position)
                .map(|c| c.name.as_str())
        });
        let statement:String=match column {
            Some(column)=>sqlx::query_scalar("SELECT format('COMMENT ON COLUMN %I.%I.%I IS %L',$1::text,$2::text,$3::text,$4::text)")
                .bind(&draft.snapshot.schema).bind(&draft.snapshot.name).bind(column).bind(item.comment.trim()).fetch_one(&mut *transaction).await.map_err(map)?,
            None=>sqlx::query_scalar("SELECT format('COMMENT ON TABLE %I.%I IS %L',$1::text,$2::text,$3::text)")
                .bind(&draft.snapshot.schema).bind(&draft.snapshot.name).bind(item.comment.trim()).fetch_one(&mut *transaction).await.map_err(map)?
        };
        if let Err(error) = sqlx::query(&statement).execute(&mut *transaction).await {
            let message = db_error(error);
            transaction.rollback().await.map_err(map)?;
            return Err(("failed".into(), message));
        }
    }
    transaction.commit().await.map_err(|_| {
        (
            "uncertain".into(),
            "提交结果待核实，请重新连接原数据库检查，勿直接重试".into(),
        )
    })
}
