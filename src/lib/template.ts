import PizZip from "pizzip";
import { renderDocument } from "./document.ts";
import type { TableInfo } from "./types";

/** 导入前检查 Word 结构和最小的数据表循环，防止导出空文档。 */
export function validateTemplate(bytes: Uint8Array) {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("模板不能超过 20 MB");
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    throw new Error("文件不是有效的 DOCX 格式");
  }
  if (!zip.file("word/document.xml") || Object.keys(zip.files).some((path) => path.endsWith("vbaProject.bin"))) {
    throw new Error("模板不是有效的 Word DOCX，或包含不允许的宏");
  }
  // 至少两个表、两种字段状态：防止未包含循环的模板在单表试渲染时误通过。
  const first: TableInfo = {
    schema: "public", name: "template_preview_one", oid: 1, comment: "模板字段示例", columnCount: 2,
    columns: [
      { name: "example_primary", position: 1, dataType: "bigint", primaryKey: true,
        notNull: true, defaultValue: "1", comment: "示例主键", identity: "", generated: "" },
      { name: "example_nullable", position: 2, dataType: "text", primaryKey: false,
        notNull: false, defaultValue: null, comment: null, identity: "", generated: "" },
    ],
  };
  const second: TableInfo = {
    schema: "archive", name: "template_preview_two", oid: 2, comment: "第二张表", columnCount: 1,
    columns: [{ name: "example_archive", position: 1, dataType: "uuid", primaryKey: false,
      notNull: true, defaultValue: null, comment: "历史标识", identity: "", generated: "" }],
  };
  try {
    const rendered = renderDocument(bytes, [first, second], {
      projectName: "模板项目示例", organization: "示例单位", version: "V1.0", date: "2026-01-01", overview: "示例概述",
    });
    const content = new PizZip(rendered).file("word/document.xml")?.asText() ?? "";
    if (!["template_preview_one", "template_preview_two", "example_primary", "example_nullable", "example_archive", "模板项目示例"]
      .every((text) => content.includes(text))) {
      throw new Error("模板需要包含 {projectName}、{#tables} 和 {#columns} 等占位符");
    }
  } catch (error) {
    throw new Error(error instanceof Error ? `模板校验失败：${error.message}` : "模板结构校验失败");
  }
}
