# 开发与构建

普通用户的安装与操作说明见 [README](../README.md)。本页供开发维护使用。

## 环境

- Node.js 24 与 npm。
- Rust 与 macOS Command Line Tools。
- 当前技术栈为 Tauri 2、React、TypeScript、Rust SQLx 和 Docxtemplater。

应用运行时不依赖 Node.js、Rust、Python、Java、Docker 或独立服务端；连接数据库及使用 AI 仍需相应服务。

## 本地运行

```bash
npm ci
npm run tauri -- dev
```

`npm run dev` 仅启动浏览器预览，不能连接数据库或保存文件。

## 构建应用

```bash
npm run tauri -- build --bundles app
```

输出：`src-tauri/target/release/bundle/macos/Database Doc.app`。当前面向本机架构构建，尚未配置 Developer ID 签名和 Apple 公证。

## 验证

```bash
npm run check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

- `check` 包含缺失注释扫描验证、Word 模板验证、TypeScript 检查及前端构建。
- 模板验证覆盖 0 表拒绝、1/3/20 表生成、跨 Schema、中文长注释、字段行数、旧项目内容清理及条件表达式。
- Rust 默认测试不连接未知数据库，实库用例默认忽略。

需要验证 PostgreSQL 行为时，先启动 Docker，再执行：

```bash
npm run verify:postgres
```

脚本创建仅监听本机随机端口、无持久卷的 PostgreSQL 17 容器，执行全部 Rust 测试后删除该容器。覆盖权限、跨 Schema、并发冲突、旧对象拒绝及事务回滚。不要将 `DATABASE_DOC_VERIFY_URL` 指向业务数据库。

历史执行结果和待验收项见[验证记录](validation/README.md)，不能据此代替当前版本的重新验证。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/` | 前端组件、状态管理、样式和 Word 导出 |
| `src-tauri/` | 桌面配置、数据库访问、AI 请求与本地存储 |
| `assets/` | 可编辑的应用图标源文件 |
| `templates/` | 运行时 Word 模板及原始母版 |
| `scripts/` | 模板生成和专项验证脚本 |
| `docs/` | 使用补充、架构、验证记录和截图 |
| `artifacts/` | 本机验证产物，不进入 Git |
| `dist/`、`src-tauri/target/` | 构建产物，不进入 Git |

## 维护内置模板

原始母版位于 `templates/source/`，保留原文件名和内容；运行时模板为 `templates/database-design.template.docx`。应用只打包运行时模板。

重新派生模板需要 Python、`python-docx` 和 `lxml`：

```bash
python3 scripts/create-template.py
npm run template:verify
```

生成脚本会检查母版结构；结构不匹配时应先重新核对，不应绕过检查。模板标记见 [Word 模板语法指南](template-syntax.md)。

## 本地配置

正式应用的配置目录为 `~/Library/Application Support/com.database-doc.desktop/`：

| 文件或目录 | 内容 |
| --- | --- |
| `preferences.json` | 连接参数、AI 地址和模型，不含明文密码或 API 密钥 |
| `workspace.json` | 项目、关联连接、选表和模板选择 |
| `templates/`、`templates.json` | 自定义模板及索引 |
| `secrets/` | 用户选择保存的加密数据库密码及本地主密钥 |

数据库密码使用 AES-256-GCM 加密；API 密钥仅在当前运行期间保留。迁移时须保留密钥与密文的配对关系，安全边界见[本地加密方案](local-encrypted-credentials.md)。
