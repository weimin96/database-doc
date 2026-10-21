import { isMissing, tableKey, type TableInfo } from "./types";

export type CommentScanFilter = "missing" | "table" | "column";

export interface CommentScanEntry {
  key: string;
  tableMissing: boolean;
  missingColumns: number;
}

/** 只统计 PostgreSQL 实际 COMMENT，AI 草稿不能冒充已完成的注释。 */
export function summarizeMissingComments(tables: TableInfo[]) {
  const entries = tables.map((table): CommentScanEntry => ({
    key: tableKey(table),
    tableMissing: isMissing(table.comment),
    missingColumns: table.columns.filter((column) => isMissing(column.comment)).length,
  }));
  return {
    scanned: entries.length,
    tableMissingCount: entries.filter((item) => item.tableMissing).length,
    columnMissingTableCount: entries.filter((item) => item.missingColumns > 0).length,
    columnMissingCount: entries.reduce((count, item) => count + item.missingColumns, 0),
    entries,
  };
}

export function matchesScanFilter(entry: CommentScanEntry, filter: CommentScanFilter) {
  switch (filter) {
    case "table": return entry.tableMissing;
    case "column": return entry.missingColumns > 0;
    case "missing": return entry.tableMissing || entry.missingColumns > 0;
  }
}
