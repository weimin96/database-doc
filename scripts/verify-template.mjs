import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { renderDocument } from "../src/lib/document.ts";
import { validateTemplate } from "../src/lib/template.ts";
const template = await readFile(
  new URL("../templates/database-design.template.docx", import.meta.url),
);
validateTemplate(template);
assert.throws(() => validateTemplate(new Uint8Array([1, 2, 3])), /有效的 DOCX/);
const options = {
  projectName: "数据库文档验收项目",
  organization: "项目建设单位",
  version: "V1.0",
  date: "2026-10-20",
  overview: "PostgreSQL 数据库结构与字段设计。",
};
const tables = Array.from({ length: 20 }, (_, index) => ({
  schema: index % 2 ? "archive" : "public",
  name: `project_${index}`,
  oid: index + 1,
  comment: "项目资料表",
  columnCount: 4,
  columns: [
    {
      name: "id",
      position: 1,
      dataType: "uuid",
      primaryKey: true,
      notNull: true,
      defaultValue: "gen_random_uuid()",
      comment: "主键标识",
      identity: "",
      generated: "",
    },
    {
      name: "title",
      position: 2,
      dataType: "character varying(255)",
      primaryKey: false,
      notNull: true,
      defaultValue: null,
      comment: "项目名称",
      identity: "",
      generated: "",
    },
    {
      name: "description",
      position: 3,
      dataType: "text",
      primaryKey: false,
      notNull: false,
      defaultValue: null,
      comment:
        "中文长注释：用于记录项目说明、审阅意见及版本变更，支持换行。\n第二行说明。",
      identity: "",
      generated: "",
    },
    {
      name: "created_at",
      position: 4,
      dataType: "timestamp with time zone",
      primaryKey: false,
      notNull: true,
      defaultValue: "now()",
      comment: null,
      identity: "",
      generated: "",
    },
  ],
}));
await mkdir("artifacts/template", { recursive: true });
assert.throws(() => renderDocument(template, [], options), /至少选择/);
for (const count of [1, 3, 20]) {
  const bytes = renderDocument(template, tables.slice(0, count), options);
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml").asText();
  // 原件的「版本记录」+「表清单」+ N 个字段明细表全部保留。
  assert.equal((xml.match(/<w:tbl>/g) || []).length, count + 2);
  assert.equal((xml.match(/<w:tr(?:\s|>)/g) || []).length, 7 + count * 6);
  assert(
    !/\{[#/^]|undefined|达梦|凯通|徐小慧|中国城市规划设计研究院|account_integrates/.test(
      xml,
    ),
  );
  assert(xml.includes("项目建设单位"));
  assert(xml.includes("版本号"));
  assert(xml.includes("版本记录"));
  assert(xml.includes("数据库设计说明书"));
  assert(xml.includes("数据安全设计"));
  assert(xml.includes("数据表清单"));
  assert(xml.includes("TOC \\o"));
  assert(xml.includes("archive.project_1") || count === 1);
  assert(xml.includes("created_at"));
  assert(xml.includes("√"));
  await writeFile(`artifacts/template/${count}-tables.docx`, bytes);
}
// Angular parser 的条件表达式、布尔判断及 inverted section 必须真正在 DOCX 中工作。
const conditionalZip = new PizZip(template);
const conditionalXml = conditionalZip.file("word/document.xml").asText();
const conditionalTemplate = conditionalXml
  .replace("{#isPrimaryKey}√{/isPrimaryKey}", "{#isPrimaryKey &amp;&amp; dataType == &quot;uuid&quot;}主键条件满足{/}")
  .replace("{remarks}{/columns}", "{#hasComment}有注释{/}{^hasComment}没有注释{/}{/columns}")
  .replace("{displayName}（{qualifiedName}）", "{#columnCount &gt; 3}多字段表{/}{displayName}（{qualifiedName}）");
assert.notEqual(conditionalTemplate, conditionalXml, "条件表达式测试未替换到母版标记");
conditionalZip.file("word/document.xml", conditionalTemplate);
const conditionalRendered = new PizZip(renderDocument(conditionalZip.generate({ type: "uint8array" }), tables.slice(0, 1), options))
  .file("word/document.xml").asText();
for (const text of ["主键条件满足", "有注释", "没有注释", "多字段表"]) {
  assert(conditionalRendered.includes(text), `条件或取反标记未生效：${text}`);
}
console.log(
  "PASS: 母版版式与版本/目录/安全章节；0 表拒绝；1/3/20 表及行循环；跨 Schema、条件判断、中文长注释及旧内容清理",
);
