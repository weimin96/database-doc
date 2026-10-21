use crate::{ai, database, models::*};
use std::collections::HashMap;

fn sample() -> TableInfo {
    TableInfo {
        schema: "public".into(),
        name: "projects".into(),
        oid: 1,
        comment: None,
        column_count: 1,
        columns: vec![ColumnInfo {
            name: "id".into(),
            position: 1,
            data_type: "uuid".into(),
            primary_key: true,
            not_null: true,
            default_value: Some("secret_default".into()),
            comment: None,
            identity: "".into(),
            generated: "".into(),
        }],
    }
}
#[test]
fn missing_and_request_boundary() {
    assert!(missing(&None));
    assert!(missing(&Some(" \n\t".into())));
    assert!(!missing(&Some("已有注释".into())));
    let (input, targets) = ai::context(&sample(), "项目管理").unwrap();
    assert_eq!(targets.len(), 2);
    assert!(!input.to_string().contains("secret_default"));
    assert!(ai::endpoint("http://external.example/v1").is_err());
    for address in [
        "http://172.18.0.21:8000/v1",
        "http://10.0.0.1/v1",
        "http://192.168.1.1/v1",
        "http://[fd00::1]/v1",
    ] {
        assert!(ai::endpoint(address).is_ok());
    }
    assert!(ai::endpoint("http://8.8.8.8/v1").is_err());
    assert!(ai::endpoint("https://user:password@example.com/v1").is_err());
    assert!(ai::endpoint("https://example.com/v1?key=private").is_err());
    assert_eq!(
        ai::endpoint("http://127.0.0.1:9000/v1/").unwrap().path(),
        "/v1/chat/completions"
    );
}

#[test]
fn qwen_chat_requests_disable_thinking() {
    let settings = AiSettings {
        base_url: "http://127.0.0.1:8000/v1".into(),
        model: "Qwen3.8-27B".into(),
        api_key: String::new(),
    };
    let mut payload = serde_json::json!({"model":settings.model,"stream":false});
    ai::disable_thinking(&settings, &mut payload);
    assert_eq!(payload["chat_template_kwargs"]["enable_thinking"], false);
    let mut generic = serde_json::json!({"model":"protocol-fixture","stream":false});
    let other = AiSettings {
        model: "protocol-fixture".into(),
        ..settings
    };
    ai::disable_thinking(&other, &mut generic);
    assert!(generic.get("chat_template_kwargs").is_none());
}
#[test]
fn rejects_untrusted_model_targets() {
    let table = sample();
    let (_, targets) = ai::context(&table, "").unwrap();
    assert!(ai::validate_output(
        r#"{"suggestions":[{"id":"unknown","comment":"注释","reason":null}]}"#,
        &table,
        &targets
    )
    .is_err());
    let deduplicated = ai::validate_output(r#"{"suggestions":[{"id":"table","comment":"a","reason":null},{"id":"table","comment":"b","reason":null}]}"#,&table,&targets).unwrap();
    assert_eq!(
        deduplicated
            .iter()
            .find(|s| s.id == "table")
            .unwrap()
            .comment
            .as_deref(),
        Some("a")
    );
    assert!(ai::validate_output(
        r#"{"suggestions":[{"id":"table","comment":" ","reason":null}]}"#,
        &table,
        &targets
    )
    .is_err());
    let result = ai::validate_output(
        r#"{"suggestions":[{"id":"table","comment":"项目表","reason":null}]}"#,
        &table,
        &targets,
    )
    .unwrap();
    assert_eq!(result.len(), 2);
    assert!(result
        .iter()
        .find(|s| s.id == "column:1")
        .unwrap()
        .reason
        .is_some());
    let wrapped = ai::validate_output(
        "<think>不输出</think>\n```json\n{\"suggestions\":[{\"id\":\"id\",\"comment\":\"记录标识\",\"reason\":null,\"extra\":1},{\"id\":\"ignored\",\"comment\":\"多余目标\",\"reason\":null},{\"id\":\"table\",\"comment\":\"项目资料表\",\"reason\":null}]}\n```",
        &table,
        &targets,
    ).unwrap();
    assert_eq!(wrapped.len(), 2);
    assert_eq!(
        wrapped
            .iter()
            .find(|s| s.id == "column:1")
            .unwrap()
            .comment
            .as_deref(),
        Some("记录标识")
    );
    assert_eq!(
        wrapped
            .iter()
            .find(|s| s.id == "table")
            .unwrap()
            .comment
            .as_deref(),
        Some("项目资料表")
    );
    assert!(ai::validate_output("```json { not json } ```", &table, &targets).is_err());
}
fn stored(snapshot: TableInfo) -> StoredDraft {
    let mut targets = HashMap::new();
    targets.insert("table".into(), None);
    for c in &snapshot.columns {
        if missing(&c.comment) {
            targets.insert(format!("column:{}", c.position), Some(c.position));
        }
    }
    StoredDraft {
        view: Draft {
            id: "verification".into(),
            schema: snapshot.schema.clone(),
            table: snapshot.name.clone(),
            suggestions: vec![],
        },
        snapshot,
        targets,
    }
}

#[tokio::test]
#[ignore = "需要专用可丢弃 PostgreSQL 数据库：DATABASE_DOC_VERIFY_URL"]
async fn postgres_metadata_write_conflict_and_permissions() {
    let address = std::env::var("DATABASE_DOC_VERIFY_URL").expect("请指定专用验证数据库");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .connect(&address)
        .await
        .unwrap();
    let mut connection = pool.acquire().await.unwrap();
    sqlx::raw_sql(r#"CREATE SCHEMA IF NOT EXISTS doc_verify; CREATE SCHEMA IF NOT EXISTS doc_archive;
 DROP TABLE IF EXISTS doc_verify."Quoted'Table";DROP TABLE IF EXISTS doc_archive."Quoted'Table";
 CREATE TABLE doc_verify."Quoted'Table"("user'name" bigint GENERATED ALWAYS AS IDENTITY, title text DEFAULT 'private default', PRIMARY KEY("user'name",title));
 CREATE TABLE doc_archive."Quoted'Table"(id integer); COMMENT ON COLUMN doc_verify."Quoted'Table".title IS '已有名称';"#).execute(&mut *connection).await.unwrap();
    let oid: i64 =
        sqlx::query_scalar(r#"SELECT 'doc_verify."Quoted''Table"'::regclass::oid::bigint"#)
            .fetch_one(&mut *connection)
            .await
            .unwrap();
    let table = database::tables(&mut connection, &[oid])
        .await
        .unwrap()
        .remove(0);
    assert!(table.columns.iter().all(|column| column.primary_key));
    assert_eq!(table.columns[0].identity, "a");
    assert!(table.columns[0].not_null);
    assert_eq!(table.columns[1].comment.as_deref(), Some("已有名称"));
    let draft = stored(table.clone());
    let injection = "中文 ' \\ 换行\n'; DROP TABLE x; --";
    let result = database::write(
        &pool,
        &draft,
        &[
            WriteItem {
                id: "column:1".into(),
                comment: injection.into(),
            },
            WriteItem {
                id: "table".into(),
                comment: "项目资料".into(),
            },
        ],
    )
    .await;
    assert_eq!(result.status, "committed", "{}", result.message);
    assert_eq!(
        result.actual.as_ref().unwrap().columns[0]
            .comment
            .as_deref(),
        Some(injection)
    );
    assert_eq!(
        result.actual.as_ref().unwrap().columns[1]
            .comment
            .as_deref(),
        Some("已有名称")
    );
    let conflict = database::write(
        &pool,
        &draft,
        &[WriteItem {
            id: "table".into(),
            comment: "不应覆盖".into(),
        }],
    )
    .await;
    assert_eq!(conflict.status, "conflict");
    let alternate: Option<String> = sqlx::query_scalar(
        r#"SELECT obj_description('doc_archive."Quoted''Table"'::regclass,'pg_class')"#,
    )
    .fetch_one(&mut *connection)
    .await
    .unwrap();
    assert!(alternate.is_none());
    let invalid = database::write(
        &pool,
        &draft,
        &[WriteItem {
            id: "column:2".into(),
            comment: "不应覆盖已有注释".into(),
        }],
    )
    .await;
    assert_eq!(invalid.status, "failed");
    // 两份同快照同时写入，锁后复核保证只有一个提交。
    sqlx::query(r#"COMMENT ON TABLE doc_verify."Quoted'Table" IS NULL"#)
        .execute(&mut *connection)
        .await
        .unwrap();
    let concurrent = stored(
        database::tables(&mut connection, &[oid])
            .await
            .unwrap()
            .remove(0),
    );
    let first = [WriteItem {
        id: "table".into(),
        comment: "并发甲".into(),
    }];
    let second = [WriteItem {
        id: "table".into(),
        comment: "并发乙".into(),
    }];
    let (a, b) = tokio::join!(
        database::write(&pool, &concurrent, &first),
        database::write(&pool, &concurrent, &second)
    );
    assert!(
        (a.status == "committed" && b.status == "conflict")
            || (b.status == "committed" && a.status == "conflict"),
        "{} / {}",
        a.status,
        b.status
    );
    // 目标名相同但 OID 变化，旧草稿必须拒绝。
    let old = stored(
        database::tables(&mut connection, &[oid])
            .await
            .unwrap()
            .remove(0),
    );
    sqlx::raw_sql(r#"DROP TABLE doc_verify."Quoted'Table";CREATE TABLE doc_verify."Quoted'Table"(id integer)"#).execute(&mut *connection).await.unwrap();
    let result = database::write(
        &pool,
        &old,
        &[WriteItem {
            id: "table".into(),
            comment: "旧草稿".into(),
        }],
    )
    .await;
    assert_eq!(result.status, "conflict");
    // 仅查询用户不能使用受限写入接口绕过 PostgreSQL 权限。
    sqlx::raw_sql("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doc_reader') THEN CREATE ROLE doc_reader; END IF; END $$;GRANT USAGE ON SCHEMA doc_verify TO doc_reader;GRANT SELECT ON ALL TABLES IN SCHEMA doc_verify TO doc_reader").execute(&mut *connection).await.unwrap();
    let readonly = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("SET ROLE doc_reader")
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect(&address)
        .await
        .unwrap();
    let new_oid: i64 =
        sqlx::query_scalar(r#"SELECT 'doc_verify."Quoted''Table"'::regclass::oid::bigint"#)
            .fetch_one(&mut *connection)
            .await
            .unwrap();
    let fresh = stored(
        database::tables(&mut connection, &[new_oid])
            .await
            .unwrap()
            .remove(0),
    );
    let denied = database::write(
        &readonly,
        &fresh,
        &[WriteItem {
            id: "table".into(),
            comment: "无权限".into(),
        }],
    )
    .await;
    assert_eq!(denied.status, "failed");
    assert!(denied.message.contains("权限不足"));
    readonly.close().await;
    sqlx::raw_sql("REVOKE ALL ON ALL TABLES IN SCHEMA doc_verify FROM doc_reader; REVOKE ALL ON SCHEMA doc_verify FROM doc_reader; DROP ROLE doc_reader").execute(&mut *connection).await.unwrap();
    drop(connection);
    pool.close().await;
}

#[tokio::test]
#[ignore = "需要专用可丢弃 PostgreSQL 数据库：DATABASE_DOC_VERIFY_URL"]
async fn postgres_transaction_rollback_after_second_comment_fails() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(3)
        .connect(&std::env::var("DATABASE_DOC_VERIFY_URL").unwrap())
        .await
        .unwrap();
    let mut connection = pool.acquire().await.unwrap();
    sqlx::raw_sql("CREATE SCHEMA IF NOT EXISTS doc_atomic;DROP TABLE IF EXISTS doc_atomic.projects;CREATE TABLE doc_atomic.projects(id integer);CREATE OR REPLACE FUNCTION doc_atomic.reject_column_comment() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE command_tag='COMMENT' AND object_type='table column') THEN RAISE EXCEPTION 'verification rejection'; END IF; END $$;CREATE EVENT TRIGGER doc_reject_column ON ddl_command_end WHEN TAG IN ('COMMENT') EXECUTE FUNCTION doc_atomic.reject_column_comment()").execute(&mut *connection).await.unwrap();
    let oid: i64 = sqlx::query_scalar("SELECT 'doc_atomic.projects'::regclass::oid::bigint")
        .fetch_one(&mut *connection)
        .await
        .unwrap();
    let draft = stored(
        database::tables(&mut connection, &[oid])
            .await
            .unwrap()
            .remove(0),
    );
    let result = database::write(
        &pool,
        &draft,
        &[
            WriteItem {
                id: "table".into(),
                comment: "应随失败回滚".into(),
            },
            WriteItem {
                id: "column:1".into(),
                comment: "触发拒绝".into(),
            },
        ],
    )
    .await;
    sqlx::query("DROP EVENT TRIGGER doc_reject_column")
        .execute(&mut *connection)
        .await
        .unwrap();
    assert_eq!(result.status, "failed");
    let actual = database::tables(&mut connection, &[oid])
        .await
        .unwrap()
        .remove(0);
    assert!(actual.comment.is_none());
    assert!(actual.columns[0].comment.is_none());
    drop(connection);
    pool.close().await;
}

#[tokio::test]
async fn ai_http_contract_and_error_classification() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    for (status,body,expected) in [
        (200,serde_json::json!({"choices":[{"finish_reason":"stop","message":{"content":"{\"suggestions\":[{\"id\":\"table\",\"comment\":\"项目资料\",\"reason\":null}]}"}}]}).to_string(),None),
        (429,"{}".into(),Some("限流")),
        (200,"invalid-response".into(),Some("不是有效 JSON")),
    ] {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
        let server=std::thread::spawn(move||{
            let (mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            let mut bytes=Vec::new();let mut buffer=[0;4096];
            let (header_end,length)=loop{
                let count=stream.read(&mut buffer).unwrap();assert!(count>0);bytes.extend_from_slice(&buffer[..count]);
                if let Some(end)=bytes.windows(4).position(|w|w==b"\r\n\r\n"){
                    let headers=String::from_utf8_lossy(&bytes[..end]);let length=headers.lines().find_map(|line|line.to_lowercase().strip_prefix("content-length:").map(|value|value.trim().parse::<usize>().unwrap())).unwrap();break(end+4,length);
                }
            };
            while bytes.len()<header_end+length{let count=stream.read(&mut buffer).unwrap();assert!(count>0);bytes.extend_from_slice(&buffer[..count]);}
            let headers=String::from_utf8_lossy(&bytes[..header_end]);assert!(headers.starts_with("POST /v1/chat/completions "));
            let request:serde_json::Value=serde_json::from_slice(&bytes[header_end..header_end+length]).unwrap();
            assert_eq!(request["model"],"protocol-fixture");assert_eq!(request["stream"],false);
            assert!(!request.to_string().contains("secret_default"));assert!(request.get("tools").is_none());
            write!(stream,"HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
        });
        let result=ai::generate(AiSettings{base_url:format!("http://{address}/v1"),model:"protocol-fixture".into(),api_key:String::new()},sample(),String::new()).await;
        server.join().unwrap();
        match expected{Some(message)=>assert!(result.err().unwrap().contains(message)),None=>assert_eq!(result.unwrap().view.suggestions.iter().find(|s|s.id=="table").unwrap().comment.as_deref(),Some("项目资料"))}
    }
}

#[tokio::test]
async fn model_discovery_and_connection_probe_contract() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    for (probe, status, body, expected) in [
        (
            false,
            200,
            r#"{"data":[{"id":"model-b"},{"id":"model-a"},{"id":"model-a"}]}"#,
            None,
        ),
        (false, 200, r#"{"data":[]}"#, Some("没有返回可用模型")),
        (false, 200, r#"{"models":[]}"#, Some("模型列表响应不兼容")),
        (false, 401, "{}", Some("认证失败")),
        (
            true,
            200,
            r#"{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}"#,
            None,
        ),
        (
            true,
            200,
            r#"{"choices":[{"message":{"content":" "}}]}"#,
            Some("缺少有效文本内容"),
        ),
        (true, 404, "{}", Some("接口或模型不存在")),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            let (header_end, length) = loop {
                let count = stream.read(&mut buffer).unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&buffer[..count]);
                if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]);
                    assert!(headers
                        .to_lowercase()
                        .contains("authorization: bearer protocol-only-key"));
                    assert!(headers.starts_with(if probe {
                        "POST /v1/chat/completions "
                    } else {
                        "GET /v1/models "
                    }));
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|value| value.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    break (end + 4, length);
                }
            };
            while bytes.len() < header_end + length {
                let count = stream.read(&mut buffer).unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&buffer[..count]);
            }
            if probe {
                let payload: serde_json::Value =
                    serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap();
                assert_eq!(payload["model"], "model-a");
                assert_eq!(payload["stream"], false);
                assert_eq!(payload["messages"].as_array().unwrap().len(), 1);
                assert_eq!(
                    payload["messages"][0]["content"],
                    "仅回复 OK，不要输出思考过程。/no_think"
                );
                assert!(payload.get("tools").is_none());
            } else {
                assert_eq!(length, 0);
            }
            write!(stream,"HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
        });
        let settings = AiSettings {
            base_url: format!("http://{address}/v1/"),
            model: "model-a".into(),
            api_key: "protocol-only-key".into(),
        };
        let result = if probe {
            ai::test_connection(settings).await.map(|_| Vec::new())
        } else {
            ai::list_models(settings).await
        };
        server.join().unwrap();
        match expected {
            Some(message) => assert!(result.unwrap_err().contains(message)),
            None => {
                let models = result.unwrap();
                if !probe {
                    assert_eq!(models, vec!["model-a", "model-b"]);
                }
            }
        }
    }
}
