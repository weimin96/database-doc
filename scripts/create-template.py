"""从原始 Word 文件原位提取模板，保留原有节、页面、段落、表格、页眉和页脚样式。

仅开发时运行（python-docx + lxml）；桌面应用在运行时只需要 Docxtemplater。
原始母版绝不写回。动态内容必须通过模板标记表达，而不是重新排版。
"""
from copy import deepcopy
from pathlib import Path
import re

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "中规院基于AI的城市设计助手数据库设计文档v0.1.docx"
TARGET = ROOT / "templates/database-design.template.docx"
doc = Document(SOURCE)
body = doc.element.body
original = list(body)


def text_of(element):
    return "".join(node.text or "" for node in element.xpath(".//w:t"))


# 索引属于这一版母版的结构合同；源文件变化时先停下来重新映射，绝不误删正文。
if (len(original) != 453 or len(doc.tables) != 89
        or text_of(original[24]).find("版本记录") == -1
        or text_of(original[86]) != "数据表结构设计"
        or text_of(original[90]) != "数据表详细字段"
        or text_of(original[438]) != "安全性设计"):
    raise ValueError("原始 Word 母版结构已变化，须重新核对动态区域位置后才能生成模板")


def paragraph_text(el, text):
    """保留段落属性和首个文字 run 的字形，去掉老值/旧链接/旧域。"""
    first = next((r for r in el if r.tag == qn("w:r")), None)
    if first is None:
        first = OxmlElement("w:r")
    else:
        first = deepcopy(first)
    for item in list(first):
        if item.tag != qn("w:rPr"):
            first.remove(item)
    value = OxmlElement("w:t")
    value.text = text
    value.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    first.append(value)
    for item in list(el):
        if item.tag != qn("w:pPr"):
            el.remove(item)
    el.append(first)
    return el


def replace_cell(cell, text):
    # 保留单元格边框、网格、段落缩进和母版的中文字符样式。
    paragraphs = cell.xpath("./w:p")
    if not paragraphs:
        p = OxmlElement("w:p")
        cell.append(p)
    else:
        p = paragraphs[0]
        for extra in paragraphs[1:]:
            cell.remove(extra)
    paragraph_text(p, text)


def trim_rows(table, count):
    rows = list(table.xpath("./w:tr"))
    if len(rows) < count:
        raise ValueError("母版表格原型缺少数据行")
    for extra in rows[count:]:
        table.remove(extra)
    return rows[:count]


def loop_paragraph(tag):
    p = deepcopy(original[94])  # 原件的空段落，继承默认行距
    return paragraph_text(p, tag)


# 封面保持原件的版式、行高和分页符。仅替换真实项目数据。
paragraph_text(original[0], "{projectName}")
paragraph_text(original[1], "")
paragraph_text(original[12], "建设单位：{organization}")
paragraph_text(original[13], "{date}")

# 版本记录原件为：标题行 + 列标题行 + 1 数据行 + 3 空行。
# 列标题及空白行都属于版式的一部分，不得改成只有两行。
version = list(original[24].xpath("./w:tr"))
if len(version) != 6:
    raise ValueError("母版版本记录行数变化，需要人工重新核验")
version_cells = version[2].xpath("./w:tc")
for cell, value in zip(version_cells, ["1", "{version}", "数据库设计说明书", "", "", "{date}"]):
    replace_cell(cell, value)

# 目录沿用旧 Word 的内容控件与 TOC 样式，但不能保留其过期页码和旧表名。
toc = original[27].find(qn("w:sdtContent"))
toc_prototypes = list(toc)
title = deepcopy(toc_prototypes[0])
paragraph_text(title, "目录")
for item in list(toc):
    toc.remove(item)
toc.append(title)


def field_run(kind, instruction=None):
    run = OxmlElement("w:r")
    if instruction is None:
        marker = OxmlElement("w:fldChar")
        marker.set(qn("w:fldCharType"), kind)
    else:
        marker = OxmlElement("w:instrText")
        marker.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        marker.text = instruction
    run.append(marker)
    return run


# WPS 打开时若未刷新 TOC，仍能看到与母版一致的层级目录，而非只有一行简写。
# 目录页码必须通过 Word / WPS 的 TOC 域更新获取，不能复用原版缓存页码。
toc_entries = [
    ("第一章 引言", 1), ("1.1 编写目的", 2), ("1.2 定义和缩略词", 2),
    ("1.2.1 数据库 DataBase", 3), ("1.2.2 表空间 TableSpace", 3),
    ("1.2.3 数据表 Table", 3), ("1.2.4 序列 Sequence", 3),
    ("1.2.5 触发器 Trigger", 3), ("1.2.6 存储过程 Stored Procedure", 3),
    ("第二章 总体设计", 1), ("2.1 部署架构", 2), ("2.2 环境说明", 2),
    ("2.3 命名规则", 2), ("第三章 数据表结构设计", 1),
    ("3.1 数据表清单", 2), ("3.2 数据表详细字段", 2),
    ("第四章 安全性设计", 1), ("4.1 数据安全设计", 2),
    ("4.1.1 数据访问控制", 3), ("4.1.2 数据加密", 3),
]
for index, (text, level) in enumerate(toc_entries):
    # 母版 TOC1/TOC2/TOC3 的缩进、制表位、行距样式，直接复制。
    paragraph = deepcopy(toc_prototypes[{1: 1, 2: 2, 3: 4}[level]])
    paragraph_text(paragraph, text)
    if index == 0:
        cursor = 1 if paragraph[0].tag == qn("w:pPr") else 0
        for run in (
            field_run("begin"),
            field_run("", ' TOC \\o "1-3" \\h \\z \\u '),
            field_run("separate"),
        ):
            paragraph.insert(cursor, run)
            cursor += 1
    if index == len(toc_entries) - 1:
        paragraph.append(field_run("end"))
    toc.append(paragraph)

# 删除原项目的部署环境与组织信息；通用说明沿用母版章节结构。
paragraph_text(original[32], "{#overview}{overview}{/overview}{^overview}本说明书描述数据库的逻辑结构与表字段设计，为系统开发、部署与维护提供依据。{/overview}")
paragraph_text(original[51], "本项目数据库使用 PostgreSQL，按业务范围划分 Schema 并管理数据库对象。")
paragraph_text(original[52], "应用服务通过数据库连接访问受控数据资源，数据库部署及访问策略以实际环境为准。")
for i in (53, 54, 55):
    paragraph_text(original[i], "")
paragraph_text(original[57], "数据库管理系统：PostgreSQL；实际版本、运行平台、部署节点和备份策略以项目部署配置为准。")
paragraph_text(original[61], "一、优先采用小写英文字母、数字和下划线组成名称；PostgreSQL 标识符最长为 63 字节（默认构建）。")
paragraph_text(original[71], "一、字段命名应清晰、无歧义，使用小写英文字母、数字与下划线；注意标识符长度限制。")

# 保留原母版的列宽、表格边框、行高、题注字号、标题层级和重复表头。
paragraph_text(original[88], "表 1 数据表清单")
list_rows = trim_rows(original[89], 2)
for cell, value in zip(list_rows[1].xpath("./w:tc"), [
    "{#tables}{index}", "{qualifiedName}", "{displayName}", "{remarks}{/tables}",
]):
    replace_cell(cell, value)

# 一组数据表标题/题注/8 列字段明细，跨段落和表格完整重复。
detail_title = deepcopy(original[91])
detail_caption = deepcopy(original[92])
detail_table = deepcopy(original[93])
paragraph_text(detail_title, "{displayName}（{qualifiedName}）")
paragraph_text(detail_caption, "表 {index} {displayName}")
detail_rows = trim_rows(detail_table, 2)
for cell, value in zip(detail_rows[1].xpath("./w:tc"), [
    "{#columns}{index}", "{name}", "{displayName}", "{dataType}",
    "{#isPrimaryKey}√{/isPrimaryKey}", "{#isNotNull}√{/isNotNull}",
    "{defaultValue}", "{remarks}{/columns}",
]):
    replace_cell(cell, value)

# 清理全部 87 张旧表；将动态区块放回原章节和原 section 位置。
for element in original[91:438]:
    body.remove(element)
security = original[438]
position = list(body).index(security)
for element in (loop_paragraph("{#tables}"), detail_title, detail_caption, detail_table, loop_paragraph("{/tables}")):
    body.insert(position, element)
    position += 1

# 项目母版页眉、页脚含旧公司名和旧页码缓存，保持版式并替换内容。
for section in doc.sections:
    for part in (section.header, section.first_page_header, section.even_page_header,
                 section.footer, section.first_page_footer, section.even_page_footer):
        for paragraph in part.paragraphs:
            content = paragraph.text
            content = re.sub(r"广东国地规划科技股份有限公司", "{organization}", content)
            content = content.replace("××系统数据库设计说明书", "{projectName}数据库设计说明书")
            # 模板原件页脚第 3/8 页是缓存，不可在动态报告中保留。
            content = re.sub(r"第\s*3\s*页\s*/\s*共\s*8\s*页", "", content)
            if content != paragraph.text:
                paragraph_text(paragraph._p, content)

# Word / WPS 在打开时更新真实 TOC 页码；不要继承母版的 87 张表旧缓存。
settings = doc.settings.element
update = settings.find(qn("w:updateFields"))
if update is None:
    update = OxmlElement("w:updateFields")
    settings.append(update)
update.set(qn("w:val"), "true")

doc.core_properties.title = "{projectName}数据库设计说明书"
doc.core_properties.author = ""
doc.core_properties.last_modified_by = ""
doc.core_properties.comments = ""
TARGET.parent.mkdir(parents=True, exist_ok=True)
doc.save(TARGET)
print(f"原件母版派生完成：{TARGET} ({TARGET.stat().st_size:,} 字节)")
