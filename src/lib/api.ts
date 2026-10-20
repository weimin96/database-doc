import { invoke,isTauri } from "@tauri-apps/api/core";
export const desktop = isTauri();
export async function command<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!desktop) throw new Error("请在 Database Doc 桌面应用中使用数据库功能");
  return invoke<T>(name, args);
}
export interface SavedConnection {
  id: string;
  label: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslmode: string;
}
export interface Preferences {
  connections: SavedConnection[];
  aiUrl: string;
  aiModel: string;
}
export const emptyPreferences: Preferences = {
  connections: [],
  aiUrl: "",
  aiModel: "",
};
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "操作失败，请重试";
