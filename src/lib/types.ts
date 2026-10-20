export interface ConnectionOptions {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslmode: string;
}
export interface TableRef {
  schema: string;
  name: string;
  oid: number;
  comment: string | null;
  columnCount: number;
}
export interface ColumnInfo {
  name: string;
  position: number;
  dataType: string;
  primaryKey: boolean;
  notNull: boolean;
  defaultValue: string | null;
  comment: string | null;
  identity: string;
  generated: string;
}
export interface TableInfo extends TableRef {
  columns: ColumnInfo[];
}
export interface DocumentOptions {
  projectName: string;
  organization: string;
  version: string;
  date: string;
  overview: string;
}
export interface AiSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}
export interface Suggestion {
  id: string;
  target: string;
  original: string | null;
  comment: string | null;
  reason: string | null;
}
export interface Draft {
  id: string;
  schema: string;
  table: string;
  suggestions: Suggestion[];
}
export interface WriteItem {
  id: string;
  comment: string;
}
export interface WriteResult {
  status: "committed" | "conflict" | "failed" | "uncertain";
  message: string;
  schema: string;
  table: string;
  actual: TableInfo | null;
}
export const tableKey = (table: { schema: string; name: string }) =>
  JSON.stringify([table.schema, table.name]);
export const isMissing = (comment: string | null) => !comment?.trim();
