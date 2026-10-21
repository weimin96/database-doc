# 缺失注释扫描与批量 AI 续跑验收

时间：2026-10-21。验证环境：独立 PostgreSQL 17 临时容器、隔离的 Tauri QA 配置、仅本机监听的 OpenAI-compatible AI 模拟接口。未连接业务 PostgreSQL，未向真实 AI 服务发送请求。

## 功能边界

- “扫描已选注释”从 PostgreSQL 重新读取**已勾选表**的最新元数据，不读取表内业务记录、不生成 AI、不写入数据库。
- 分开统计缺少表级 COMMENT 的表、缺少字段级 COMMENT 的表及字段数；结果仅展示这些已勾选表，按“全部缺失 / 缺表注释 / 缺字段注释”筛选。
- 筛选仅影响左侧表清单及“AI 补全筛选结果”的调用范围，不改变已勾选表的选择。重复生成时跳过已有 AI 草稿。
- 切换项目、重新连接、刷新结构、修改勾选、写回注释、断开数据库连接会使扫描快照失效；避免拿陈旧结果误导用户。
- 采用现有 `generate_comments` / `write_comments` 命令；仅生成缺失注释，建议不自动写库，需勾选并确认。

## 实际 UI / PostgreSQL / AI 协议验证

测试共 4 张表：`qa_scan.projects`（缺表注释与 2 个字段注释）、`qa_scan.orders`（有表注释，缺 1 个字段注释）、`qa_scan.complete`（全部注释完整）、`audit_scan.projects`（跨 Schema 同名表且完整）。

- 原生桌面 UI 勾选全部 4 张表，单击扫描：扫描 4 张，1 张缺表注释、2 张缺字段注释（总共 3 个字段）；左侧只出现 `qa_scan.orders` 和 `qa_scan.projects`。
- 点击“缺表注释”后左侧仅出现 `qa_scan.projects`，勾选状态保持不变；再切换“缺字段注释”，左侧出现 2 张命中表。
- 点击“AI 补全筛选结果”：发送信息提示 2 张表；本机模拟 AI 实际记录到两次调用。`orders` 只含 `column:2`，`projects` 含 `table`、`column:1`、`column:2`。完整表及现有注释没有生成请求；请求设置为非流式，携带 `chat_template_kwargs.enable_thinking=false`。
- UI 显示“已处理 2/2 张表，建议已显示在表结构页，尚未写入数据库”。
- `npm run check` 的扫描专项已覆盖真实注释计数、跨 Schema 同名表、空表、完整表和筛选类型。

生成后的模型输出准确性依赖所配置的真实供应商；本次使用协议模拟接口，未验证特定第三方厂商模型的响应质量。QA 截图与请求日志在被 Git 忽略的 `artifacts/scan-qa/`，需保持私有。

正式 `npm run tauri -- build --bundles app` 构建成功，Apple Silicon `.app` 约 17.90 MiB；已替换 `/Applications/Database Doc.app`，复制前后可执行文件 SHA-256 一致，并已从正式安装路径启动进程。原有用户项目和连接配置未被 QA 测试覆盖。本轮没有提交或推送 Git。
