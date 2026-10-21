# README 截图与文件整理验证

日期：2026-10-21。

## 环境与来源

- 使用当前项目构建的 macOS Tauri 应用，独立标识为 `com.database-doc.readme`，不复用正式应用配置。
- 通过 `cua-driver 0.31.0` 的窗口状态、可访问性控件和原生输入操作，使用 `get_window_state` 保存窗口截图；逐张查看生成的 PNG。
- 示例项目为“项目管理示例”，建设单位为“示例团队”。PostgreSQL 17 位于仅绑定 `127.0.0.1` 随机端口的临时 Docker 容器，无业务记录、无持久卷。
- 演示库包含 `projects`、`project_members`、`deliverables` 三张表，共 13 个字段；仅 `project_members.role` 缺少字段注释。
- 连接示例使用本机无密码、非 SSL 实例；README 明确要求实际使用按管理员提供的认证与 SSL 设置填写。

## 实际操作与截图

前置条件：独立应用已打包，临时数据库已就绪，CUA 能读取并操作目标窗口。

| 操作 | 预期 | 实际结果 | 截图 |
| --- | --- | --- | --- |
| 输入项目名称、单位、概述 | 信息完整可见，可保存进入 | 通过；保存后进入连接窗口 | [项目](../images/project.png) |
| 填写本机连接参数并连接 | 读取三张示例表 | 通过；显示 `3 张表` | [连接](../images/connection.png) |
| 全选数据表，查看 `projects` | 已选三张，显示五个字段及注释 | 通过；字段类型、约束、注释和默认值可见 | [工作台](../images/workspace.png) |
| 检查缺失注释 | 三张表中一张表的一个字段缺失 | 通过；缺表注释 0，缺字段注释 1 张 / 1 个字段 | [扫描](../images/comment-scan.png) |
| 打开模板管理 | 展示内置模板、下载和导入入口 | 通过 | [模板](../images/templates.png) |
| 打开 Word 导出窗口 | 显示三张表和已填项目信息 | 通过；模板、项目信息和导出操作可见 | [导出](../images/export.png) |

本轮没有调用 AI、写入应用中的注释建议、导入自定义模板或通过原生保存面板导出文档。导出窗口截图证明入口与信息展示，不能代替最终文件落盘及 Word/WPS 打开验收。

完成截图后已在界面断开演示连接，并停止、删除本轮临时容器。正式应用项目、连接配置和业务数据库未修改。操作中间产物保留在被 Git 忽略的 `artifacts/readme/`；只有检查后的六张演示截图进入 `docs/images/`。

## 文件整理

- 原始 Word 母版从根目录移入 `templates/source/`，不改变文件名和内容。移动前后 SHA-256 均为 `cddf6614c12af330f11ae0a30750ecfc1541a7408017cace9bd19d5e3ef83494`。
- `scripts/create-template.py` 的输入路径同步调整，运行时模板路径不变。本轮未重新生成模板，以保留现有模板内容。
- 综合、扫描和原位 AI 验收记录归入 `docs/validation/`；已废弃 Keychain 记录归入 `docs/archive/`。
- 开发命令、验证命令、目录说明及本地配置说明移入 `docs/development.md`，README 改为普通用户操作指南。
- `docs/README.md` 与 `templates/README.md` 提供文档和模板入口；源码、构建目录和既有私有验收产物不搬动。

## 自动检查

- `npm run tauri -- build --bundles app --config artifacts/readme/tauri.readme.json`：演示副本构建成功；存在既有 Vite 大文件分块警告。
- `npm run template:verify`：通过，覆盖母版版式与章节、0 表拒绝、1/3/20 表、跨 Schema、条件表达式、中文长注释和旧内容清理。
- Python 一次性检查：通过；12 个 Markdown 文件、40 个本地链接、六张 1568 × 1037 PNG 的文件头和尺寸，以及生成脚本的母版输入路径与文件哈希均符合预期。
- `git diff --check`：通过，无空白错误。
