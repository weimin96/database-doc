# Database Doc

macOS 本地数据库文档工具。使用 Tauri 2、React、Rust SQLx 和 Docxtemplater。

## 使用

- 连接 PostgreSQL，选择 Schema 和数据表，查看字段、主键、非空、默认值与 COMMENT。
- 在“AI 设置”填写兼容 OpenAI 的 API base URL 和可选密钥，自动获取模型列表后选择模型；“测试模型连接”会实际发送一条简短请求。地址包含服务版本路径，例如 `https://api.example.com/v1`；应用在其后追加 `/chat/completions`。
- 勾选数据表，使用“AI 补全”。确认发送的结构信息后生成建议；审阅、编辑并逐项勾选，再确认写入数据库。已有非空注释不会覆盖。
- “导出 Word”填写项目信息并保存 `.docx`。未写回的 AI 建议不进入导出内容。

AI 地址支持 HTTPS；已按内网使用需求允许私有 IP、链路本地 IP 和本机回环地址使用 HTTP。生成建议不读取业务记录，但会把确认范围内的结构和已有注释发送给所配置服务。写注释需要对象所有者等相应权限，仅有 SELECT 权限的账户可以查看结构和导出文档。

连接配置和 AI 地址、模型保存在 macOS 应用配置目录；数据库密码和 API 密钥只在当前运行期间使用，不落盘；已移除全部 Keychain 集成。界面中的“停止后续处理”允许当前表结束后停止批次，已提交表不会撤销。提交结果不明时需重新连接核实，不能直接重放。

## 本地开发

需要 Node.js 24、npm、Rust 与 macOS Command Line Tools。应用运行不依赖 Python、Java、psql、Docker 或独立服务端。

```bash
npm ci
npm run tauri -- dev
```

仅运行 `npm run dev` 是浏览器预览，不能连接数据库或保存文件。

## 构建

```bash
npm run tauri -- build --bundles app
```

应用输出到 `src-tauri/target/release/bundle/macos/Database Doc.app`。当前构建面向本机架构，尚未配置 Developer ID 签名和 Apple 公证。

## 验证

```bash
npm run check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run verify:postgres
```

- `check` 验证空选择拒绝、1/3/20 表 DOCX 生成、表格与字段行数量、中文长注释、跨 Schema，以及旧项目内容清理，并完成 TypeScript 检查和前端构建。
- 默认 Rust 测试覆盖缺失判定、AI 输入最小化、地址约束、不可信输出校验及 HTTP 协议和错误分类。实库用例默认忽略，避免连接未知数据库。
- `verify:postgres` 需要正在运行的 Docker；创建只监听本机随机端口、无持久卷的独立 PostgreSQL 17 容器，执行全部 Rust 测试后停止并删除该容器。覆盖权限、联合主键、标识列、跨 Schema、特殊字符、并发、旧对象拒绝和事务回滚。测试会创建及删除专用对象，不能对生产数据库设置 `DATABASE_DOC_VERIFY_URL`。

真实操作记录与未验收项见 [验证记录](docs/validation.md)，设计边界见 [架构文档](docs/architecture.md)。

## Word 模板

运行时只使用 `templates/database-design.template.docx`。原始 Word 母版不修改，派生模板沿用其 A4 页面、宋体及八列表格风格，清除旧项目固定内容。当前模板包括封面、项目概述、表清单和逐表字段明细，采用无编号语义标题；不包含原项目部署说明或安全性正文，不生成自动目录。

`python3 scripts/create-template.py` 可从原始母版重新生成受控模板，仅开发时需要 `python-docx`；随后运行 `npm run template:verify`。生成过程不在应用运行时调用 Python。
