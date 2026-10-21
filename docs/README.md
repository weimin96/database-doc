# 文档导航

## 使用软件

- [使用说明](../README.md)：安装、创建项目、连接数据库、整理注释与导出 Word。
- [Word 模板语法](template-syntax.md)：编辑和导入自定义模板。

## 开发维护

- [开发与构建](development.md)：环境、开发命令、目录、验证与模板维护。
- [架构选型](architecture.md)：初版设计及演进背景，部分描述为历史决策。
- [本地加密数据库密码](local-encrypted-credentials.md)：当前凭据存储实现与安全边界。

## 验证记录

- [综合验证记录](validation/README.md)：历次构建、数据库、桌面及 Word 验收。
- [缺失注释扫描](validation/comment-scan.md)：扫描、筛选和批量续跑验收。
- [AI 注释原位展示](validation/inline-ai.md)：表结构页建议展示与回写验收。
- [README 截图记录](validation/readme-screenshots.md)：界面截图来源与本次检查结果。

验证记录保留执行时的事实，不代表当前版本所有场景均已重新验证。

## 历史归档

- [已废弃的 Keychain 方案](archive/project-keychain-flow.md)：仅用于追溯，当前软件使用本地加密文件。

`images/` 存放使用说明中的公开截图；临时日志、验证导出文件及私有截图保留在被 Git 忽略的 `artifacts/`。
