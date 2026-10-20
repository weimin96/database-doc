use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionOptions {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    pub sslmode: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub position: i16,
    pub data_type: String,
    pub primary_key: bool,
    pub not_null: bool,
    pub default_value: Option<String>,
    pub comment: Option<String>,
    pub identity: String,
    pub generated: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    pub oid: i64,
    pub comment: Option<String>,
    pub column_count: i64,
    pub columns: Vec<ColumnInfo>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Suggestion {
    pub id: String,
    pub target: String,
    pub original: Option<String>,
    pub comment: Option<String>,
    pub reason: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub schema: String,
    pub table: String,
    pub suggestions: Vec<Suggestion>,
}
pub struct StoredDraft {
    pub view: Draft,
    pub snapshot: TableInfo,
    pub targets: HashMap<String, Option<i16>>,
}
pub struct Session {
    pub pool: PgPool,
    pub drafts: HashMap<String, StoredDraft>,
}
#[derive(Default)]
pub struct AppState(pub tokio::sync::Mutex<Option<Session>>);
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WriteItem {
    pub id: String,
    pub comment: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub status: String,
    pub message: String,
    pub schema: String,
    pub table: String,
    pub actual: Option<TableInfo>,
}

pub fn missing(value: &Option<String>) -> bool {
    value.as_ref().is_none_or(|s| s.trim().is_empty())
}
pub fn valid_comment(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 2000 && !value.contains('\0')
}
pub fn db_error(error: sqlx::Error) -> String {
    if let sqlx::Error::Database(ref db) = error {
        return match db.code().as_deref() {
            Some("28P01" | "28000") => "数据库认证失败，请检查用户名和密码".into(),
            Some("42501") => "数据库权限不足；写注释需要对象所有者等相应权限".into(),
            Some("55P03" | "57014") => "数据库锁等待或查询超时，请稍后刷新重试".into(),
            Some("3D000") => "目标数据库不存在".into(),
            Some("42P01" | "42703") => "目标表或字段已变化，请刷新后重试".into(),
            _ => format!(
                "数据库操作失败（SQLSTATE {}）",
                db.code().as_deref().unwrap_or("未知")
            ),
        };
    }
    match error {
        sqlx::Error::PoolTimedOut => "数据库连接超时".into(),
        sqlx::Error::Tls(_) => "数据库 TLS 连接失败，请检查 SSL 模式和证书".into(),
        sqlx::Error::Io(_) => "数据库网络连接失败或中断".into(),
        _ => "数据库操作失败，请检查连接及元数据兼容性".into(),
    }
}
