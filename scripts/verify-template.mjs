import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { renderDocument } from "../src/lib/document.ts";
const template = await readFile(
  new URL("../templates/database-design.template.docx", import.meta.url),
);
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
  assert.equal((xml.match(/<w:tbl>/g) || []).length, count + 1);
  assert.equal((xml.match(/<w:tr>/g) || []).length, 1 + count + count * 5);
  assert(
    !/\{[#/]|undefined|达梦|凯通|徐小慧|中国城市规划设计研究院|account_integrates/.test(
      xml,
    ),
  );
  assert(xml.includes("archive.project_1") || count === 1);
  assert(xml.includes("created_at"));
  await writeFile(`artifacts/template/${count}-tables.docx`, bytes);
}
console.log(
  "PASS: 0 表拒绝；1/3/20 表生成；表格与字段行数量、跨 Schema、中文长注释及旧内容清理",
);
