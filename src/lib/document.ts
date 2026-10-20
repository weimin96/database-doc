import Docxtemplater from "docxtemplater";
import expressionParser from "docxtemplater/expressions.js";
import PizZip from "pizzip";
import type { DocumentOptions, TableInfo } from "./types.ts";

// Docxtemplater 官方表达式解析器：变量、循环、真值条件、比较、布尔表达式。
// 不对模板进行 eval / new Function，不允许在客户端执行自定义脚本。
const parser = expressionParser.configure({});

export function renderDocument(
  template: ArrayBuffer | Uint8Array,
  tables: TableInfo[],
  options: DocumentOptions,
): Uint8Array {
  if (!tables.length) throw new Error("至少选择一张数据表");
  if (!options.projectName.trim()) throw new Error("请输入项目名称");
  const doc = new Docxtemplater(new PizZip(template), {
    parser,
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render({
    ...options,
    hasOverview: Boolean(options.overview.trim()),
    hasOrganization: Boolean(options.organization.trim()),
    tableCount: tables.length,
    schemaNames: [...new Set(tables.map((table) => table.schema))].join(", "),
    tables: tables.map((table, index) => ({
      index: index + 1,
      schema: table.schema,
      name: table.name,
      comment: table.comment?.trim() ?? "",
      columnCount: table.columns.length,
      qualifiedName: `${table.schema}.${table.name}`,
      displayName: table.comment?.trim() || table.name,
      hasComment: Boolean(table.comment?.trim()),
      remarks: "",
      columns: table.columns.map((column, position) => ({
        index: position + 1,
        name: column.name,
        comment: column.comment?.trim() ?? "",
        position: column.position,
        displayName: column.comment?.trim() || column.name,
        hasComment: Boolean(column.comment?.trim()),
        isPrimaryKey: column.primaryKey,
        isNotNull: column.notNull,
        hasDefault: Boolean(column.defaultValue),
        identity: column.identity,
        generated: column.generated,
        dataType: column.dataType,
        primaryKey: column.primaryKey ? "是" : "",
        notNull: column.notNull ? "是" : "",
        defaultValue:
          column.defaultValue ?? (column.identity ? "IDENTITY" : ""),
        remarks: column.generated ? "生成列" : column.identity ? "标识列" : "",
      })),
    })),
  });
  const zip = doc.getZip();
  if (!zip.file("word/document.xml")) throw new Error("生成文档缺少正文");
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}
