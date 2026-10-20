# Database Doc：Word 模板语法

## 原理及编辑方式

模板是普通的 `.docx` 文件，**由 Word/WPS 决定全部字号、边距、页眉页脚、表格列宽、背景、标题样式和分页**；Database Doc 只填充占位符和重复相应的行/段落，不重新设计文档。默认模板 `templates/database-design.template.docx` 从项目原始 Word 母版的实际内容派生，而不是重新新建空白文档。

点击桌面应用「模板 → 下载模板示例」，在 Word/WPS 中编辑文本和样式，保留动态标记，再「导入 DOCX 模板」。应用会用模拟表结构试渲染校验，避免保存不完整的模板。

使用 **Docxtemplater 3 + Angular 表达式解析器**，支持以下语法，**不是 Jinja2/Velocity**；模板内不能写 SQL、JavaScript 代码或调用 API。

### 1. 普通占位符

| 标记 | 值 |
| --- | --- |
| `{projectName}` | 项目名称 |
| `{organization}` | 建设单位 |
| `{version}` | 文档版本 |
| `{date}` | 编制日期 |
| `{overview}` | 项目概述 |
| `{tableCount}` | 本次选择的数据表数量 |
| `{schemaNames}` | 所选表所属 Schema（去重，逗号分隔） |

在 Word 中可直接输入：`{projectName}数据库设计说明书`。字体、颜色和其他格式以模板中这个占位符所在文字的格式为准。模板的文本标记可以被 Word 分成多个 run，Docxtemplater 会跨 run 识别。

### 2. 重复数据表

```text
{#tables}
{index}. {qualifiedName} / {displayName}
{/tables}
```

`tables` 每项可访问：`index`（从 1 开始）、`schema`、`name`、`qualifiedName`、`comment`、`displayName`（缺少注释时取表名）、`columnCount`、`hasComment`、`columns`。

**重复表格行**：在 Word 的表格中，保留标题行，只在一行数据样例的**第一个单元格**输入 `{#tables}{index}`，最后一个单元格放 `{remarks}{/tables}`；中间各单元格写 `{qualifiedName}`、`{displayName}` 等。引擎会完整复制当前数据行，且沿用标题行和数据行的原始表格样式。

### 3. 嵌套重复字段

```text
{#tables}
  {displayName}（{qualifiedName}）
  # | 字段 | 类型 | 非空
  {#columns}{index} | {name} | {dataType} | {isNotNull}{/columns}
{/tables}
```

在实际 Word 中应创建真实表格（上方代码仅表示逻辑结构），而不是粘贴含 `|` 的纯文本。

字段可使用：`index`、`position`、`name`、`comment`、`displayName`、`dataType`、`primaryKey`（`是`/空）、`notNull`、`defaultValue`、`remarks`、`identity`、`generated`、`isPrimaryKey`、`isNotNull`、`hasComment`、`hasDefault`。

**重复整个表块**：将 `{#tables}` 与 `{/tables}` 分别独占一个 Word 段落，包围「表名称标题段落 + 表题注段落 + 字段明细表格」；字段明细的单行数据则由 `{#columns}`/`{/columns}` 标记包围。一个表块可以跨多个 Word 段落和表格，循环时保留原生 `w:p` / `w:tbl` 排版。

### 4. 条件显示（if）

```text
{#isPrimaryKey}√{/isPrimaryKey}
{#hasDefault}{defaultValue}{/hasDefault}
{#columnCount > 5}该表字段较多{/}
{#schema == "public"}公共 Schema{/}
```

规则：`{#条件}` 为真时显示包围内容，`{/条件}` 或 `{/}` 结束；支持 `>`, `<`, `==`, `!=`, `&&`, `||`, `!` 与 `length` 等表达式。注意 Word 中写 `<` 时仍按普通文本输入，DOCX 内部会自动 XML 转义。

### 5. else / 缺失值

```text
{#hasComment}{displayName}{/hasComment}
{^hasComment}暂未维护字段注释{/hasComment}
```

`^` 表示条件取反。要实现 if/else，就把真假两个片段连续放置，适用于缺失注释、没有默认值、不同 Schema 说明等场景。

也可在单行内使用三元表达式：`{isPrimaryKey ? "是" : "否"}`。

### 6. Word 排版注意事项

1. **循环标记必须成对出现**，重复整段/表块时每个开闭标记独占一段，且不能夹杂其他文本。重复数据行时开闭标记可放在该行首尾单元格。
2. 修改循环示例行的字体、边框和行距，就会影响所有生成行；**不需要**在代码里写页面布局。
3. 表标题与下方表格在 Word 中设定「与下段同页」，防止孤立标题；表头行设定「在各页顶端重复标题行」。
4. 原母版的目录保留了 Word TOC 域；文档内容变动后，**在 Word/WPS 中更新整个目录/域**才能得到正确页码，程序不能在不排版的情况下精确计算页码。
5. 内置模板已移除原项目 87 张历史表的固定数据，以及原项目的单位、达梦/部署信息；**不能**把原 Word 文件未经处理就导入后直接生成。
6. 条件分支与循环会改变正文高度，动态生成文档与母版可以保持同一套格式，但内容和页数自然不可能逐像素一样。

### 7. 模板错误处理

应用导入模板时会用多张模拟表进行试渲染。非法 DOCX、缺失必要循环、字段映射不完整等会报错，而不是静默生成空白文档。模板可以使用本地文件、页眉页脚、Word 样式；不允许宏与自定义脚本。
