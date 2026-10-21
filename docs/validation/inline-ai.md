# AI 注释原位展示与关闭 Qwen 思考模式验收

2026-10-21。范围：Database Doc 表结构页、AI 请求及 PostgreSQL 注释回写。使用独立的 PostgreSQL 17 临时容器、仅监听 `127.0.0.1` 的 OpenAI-compatible 协议夹具和临时 Tauri QA 应用标识；不访问原业务库。

## 行为与证据

1. 样例库 `qa_comment` 有 `projects`（表和三个字段注释缺失）与 `orders`（表已有注释、部分字段缺失）。桌面应用连接后显示两张表，左侧是 `orders / 订单表已有注释`、`projects / 暂无表注释`，没有 `public` 或字段数。
2. 配置 QA 模型 `Qwen3.8-27B`，模型获取和“测试模型连接”成功；夹具记录的两次 POST 均包含 `chat_template_kwargs: {"enable_thinking":false}`，并要求 `/no_think`。真实供应商模型的兼容性不在此次测试范围内。
3. 没有勾选 Word 导出表时，选中 `qa_comment.projects`，直接点击“AI 补全当前表”，确认发送结构。表注释在表标题下面显示 AI 建议，三项字段建议在各自“注释”列显示，且均可编辑、独立勾选；未确认前数据库注释为空。截图：`artifacts/inline-qa/inline-suggestions.png`。
4. 仅勾选表注释与 `note` 字段后选择“写入已勾选 · 2”，二次确认。结果为“已提交并回读验证”，数据库 `obj_description` 和 `col_description(note)` 有新值，未勾选的 `id`、`project_name` 依旧为空。侧边栏展示已写入的表注释。
5. 现有 DOCX 模板 1/3/20 表验证通过；独立 Postgres 集成测试（8/8）通过；Rust clippy 与前端 TypeScript/build 通过。

仅使用同项目的最小实现，不引入第二套注释草稿存储；保留后端的快照校验、已有注释拒绝覆盖和逐表事务。QA 数据库和模型夹具均为一次性验收用途。
