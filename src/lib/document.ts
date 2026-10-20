import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { DocumentOptions,TableInfo } from "./types.ts";

export function renderDocument(
  template: ArrayBuffer | Uint8Array,
  tables: TableInfo[],
  options: DocumentOptions,
): Uint8Array {
  if (!tables.length) throw new Error("至少选择一张数据表");
  if (!options.projectName.trim()) throw new Error("请输入项目名称");
  const doc = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render({
    ...options,
    tables: tables.map((table, index) => ({
      index: index + 1,
      qualifiedName: `${table.schema}.${table.name}`,
      displayName: table.comment?.trim() || table.name,
      columns: table.columns.map((column, position) => ({
        index: position + 1,
        name: column.name,
        displayName: column.comment?.trim() || column.name,
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
