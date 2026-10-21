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

## 手动发布 Release

将代码推送到 `main` 后，进入 GitHub 仓库的 **Actions → 手动发布 macOS → Run workflow**，选择 `main` 并运行。

- 读取项目版本创建 `v版本号` 标签，发布 Apple Silicon ZIP 和 `SHA256SUMS.txt`。ZIP 解压后可直接获得 `.app`。
- 发布前确保 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 及两份锁文件中的项目版本一致。已有同名标签或 Release 时停止，不覆盖旧版本。
- 仅手动运行，使用单个 `macos-15` ARM64 标准 Runner，45 分钟超时；不构建 Intel 或 Universal 版本。
- Checkout v7.0.1、Setup Node v7.1.0、Cache v6.1.0 均固定到完整提交 SHA，运行时为 Node 24。Rust 使用 Runner 预装版本，不重复安装。
- 只缓存 Cargo 下载和 release 依赖编译结果，排除项目自身编译结果；缓存按编译器、Xcode、Cargo 依赖和构建配置区分，单纯升级项目版本不会产生重复缓存。不缓存 `node_modules`、调试构建或安装包。
- 产物直接上传 Release，不额外上传 Actions Artifact；只需自带的 `GITHUB_TOKEN`，无需配置 PAT。构建启用免费的 ad-hoc 签名，完整应用通过签名校验后才压缩；未配置 Developer ID 签名或 Apple 公证。

公开仓库使用标准 Runner 的构建分钟免费；缓存仍使用仓库的默认额度，本工作流不修改付费设置。规则见 [GitHub Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)与 [Release 存储说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas)。

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
