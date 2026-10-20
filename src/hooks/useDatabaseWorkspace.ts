import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useEffect, useRef, useState } from "react";
import templateUrl from "../../templates/database-design.template.docx?url";
import type { ReviewDraft } from "../components/CommentReview";
import {
  command,
  desktop,
  emptyPreferences,
  messageOf,
  type Preferences,
} from "../lib/api";
import {
  type AiSettings,
  type ConnectionOptions,
  type DocumentOptions,
  type Draft,
  isMissing,
  type TableInfo,
  tableKey,
  type WriteResult,
} from "../lib/types";
const initialOptions: DocumentOptions = {
  projectName: "",
  organization: "",
  version: "V1.0",
  date: new Date().toLocaleDateString("sv-SE"),
  overview: "",
};
export function useDatabaseWorkspace() {
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [connection, setConnection] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [schema, setSchema] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [ai, setAi] = useState<AiSettings>({
    baseUrl: "",
    model: "",
    apiKey: "",
  });
  const [background, setBackground] = useState("");
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [review, setReview] = useState(false);
  const [confirm, setConfirm] = useState<"generate" | "write" | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [documentOptions, setDocumentOptions] = useState(initialOptions);
  const [outputPath, setOutputPath] = useState("");
  const [results, setResults] = useState<WriteResult[]>([]);
  const cancelled = useRef(false);
  const task = useRef(false);
  const chosen = selected
    .map((key) => tables.find((table) => tableKey(table) === key))
    .filter((table): table is TableInfo => !!table);
  const visible = tables.filter(
    (table) =>
      (!schema || table.schema === schema) &&
      `${table.name} ${table.comment ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = tables.find((table) => tableKey(table) === active);
  const eligible = chosen.filter(
    (table) =>
      isMissing(table.comment) ||
      table.columns.some((column) => isMissing(column.comment)),
  );
  const pendingTables = eligible.filter(
    (table) =>
      !drafts.some(
        (draft) => draft.schema === table.schema && draft.table === table.name,
      ),
  );
  const missingCount = pendingTables.reduce(
    (total, table) =>
      total +
      Number(isMissing(table.comment)) +
      table.columns.filter((column) => isMissing(column.comment)).length,
    0,
  );
  const selectedDrafts = drafts.filter((draft) =>
    chosen.some(
      (table) => table.schema === draft.schema && table.name === draft.table,
    ),
  );
  const writeCount = selectedDrafts.reduce(
    (count, draft) =>
      count + Object.values(draft.edits).filter((edit) => edit.selected).length,
    0,
  );
  function report(error: unknown) {
    setNotice({ error: true, text: messageOf(error) });
  }
  async function run(label: string, action: () => Promise<void>) {
    if (task.current) return false;
    task.current = true;
    cancelled.current = false;
    setBusy(label);
    setNotice(null);
    try {
      await action();
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      setBusy("");
      task.current = false;
    }
  }
  useEffect(() => {
    if (!desktop) return;
    command<Preferences>("load_preferences")
      .then((value) => {
        setPreferences(value);
        setAi({ baseUrl: value.aiUrl, model: value.aiModel, apiKey: "" });
      })
      .catch(report);
  }, []);
  function toggle(table: TableInfo) {
    const key = tableKey(table);
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((value) => value !== key)
        : [...previous, key],
    );
  }
  async function connect(
    options: ConnectionOptions,
    saveConnection: boolean,
    id: string,
  ) {
    return await run("连接数据库", async () => {
      const loaded = await command<TableInfo[]>("connect_database", {
        options,
      });
      setTables(loaded);
      setConnection(`${options.host}:${options.port} / ${options.database}`);
      setDrafts([]);
      setResults([]);
      setSelected([]);
      setActive(loaded[0] ? tableKey(loaded[0]) : "");
      setSchema("");
      setReview(false);
      setConnectOpen(false);
      if (saveConnection) {
        const { password: _, ...safe } = options;
        const entry = {
          ...safe,
          id,
          label: `${options.database} · ${options.host}`,
        };
        const next = {
          ...preferences,
          connections: [
            ...preferences.connections.filter((item) => item.id !== id),
            entry,
          ],
        };
        await command("save_preferences", { preferences: next });
        setPreferences(next);
      }
    });
  }
  async function refresh() {
    await run("刷新结构", async () => {
      const loaded = await command<TableInfo[]>("read_tables", { ids: [] });
      setTables(loaded);
      setDrafts([]);
      setSelected((previous) =>
        previous.filter((key) =>
          loaded.some((table) => tableKey(table) === key),
        ),
      );
      setNotice({ error: false, text: "已刷新数据库结构，旧注释草稿已清除" });
    });
  }
  async function saveAi(value: AiSettings) {
    await run("保存 AI 设置", async () => {
      await command("validate_ai_settings", { settings: value });
      const next = {
        ...preferences,
        aiUrl: value.baseUrl.trim(),
        aiModel: value.model.trim(),
      };
      await command("save_preferences", { preferences: next });
      setPreferences(next);
      setAi({
        ...value,
        baseUrl: value.baseUrl.trim(),
        model: value.model.trim(),
      });
      setAiOpen(false);
    });
  }
  async function generate() {
    setConfirm(null);
    await run("生成注释建议", async () => {
      setReview(true);
      setResults([]);
      let done = 0;
      const failures: string[] = [];
      for (const table of pendingTables) {
        if (cancelled.current) break;
        setBusy(`生成注释 ${done + 1}/${pendingTables.length} · ${table.name}`);
        try {
          const draft = await command<Draft>("generate_comments", {
            oid: table.oid,
            settings: ai,
            background,
            expected: table,
          });
          setDrafts((previous) => [
            ...previous.filter(
              (item) =>
                !(item.schema === draft.schema && item.table === draft.table),
            ),
            {
              ...draft,
              edits: Object.fromEntries(
                draft.suggestions.map((item) => [
                  item.id,
                  { selected: false, text: item.comment ?? "" },
                ]),
              ),
            },
          ]);
        } catch (error) {
          failures.push(`${table.schema}.${table.name}：${messageOf(error)}`);
        }
        done++;
      }
      setNotice({
        error: failures.length > 0,
        text: `${cancelled.current ? "已停止后续生成；" : ""}已处理 ${done}/${pendingTables.length} 张表${failures.length ? `；${failures.join("；")}` : "，建议等待审阅，尚未写入数据库"}`,
      });
    });
  }
  async function write() {
    setConfirm(null);
    await run("写入数据库注释", async () => {
      setResults([]);
      let stopped = false;
      const plan = selectedDrafts
        .map((draft) => ({
          draft,
          items: Object.entries(draft.edits)
            .filter(([, edit]) => edit.selected)
            .map(([id, edit]) => ({ id, comment: edit.text })),
        }))
        .filter((entry) => entry.items.length)
        .sort((a, b) =>
          `${a.draft.schema}.${a.draft.table}`.localeCompare(
            `${b.draft.schema}.${b.draft.table}`,
          ),
        );
      if (
        plan.some((entry) =>
          entry.items.some(
            (item) => !item.comment.trim() || item.comment.length > 2000,
          ),
        )
      )
        throw new Error("选中的注释不能为空，且不能超过 2000 字");
      for (const { draft, items } of plan) {
        if (cancelled.current) {
          stopped = true;
          break;
        }
        setBusy(`写入注释 · ${draft.schema}.${draft.table}`);
        let result: WriteResult;
        try {
          result = await command<WriteResult>("write_comments", {
            draftId: draft.id,
            items,
          });
        } catch (error) {
          result = {
            status: "uncertain",
            message: `调用中断，结果待核实：${messageOf(error)}`,
            schema: draft.schema,
            table: draft.table,
            actual: null,
          };
        }
        setResults((previous) => [...previous, result]);
        setDrafts((previous) =>
          previous.filter((item) => item.id !== draft.id),
        );
        if (result.actual) {
          const actual = result.actual;
          setTables((previous) =>
            previous.map((table) =>
              tableKey(table) === tableKey(actual) ? actual : table,
            ),
          );
        }
        if (result.status !== "committed") {
          stopped = true;
          break;
        }
      }
      setNotice({
        error: stopped,
        text: stopped
          ? "批次已停止。逐表结果见下方，其余表尚未执行；请刷新或重新连接核实。"
          : "本批次已提交并回读验证",
      });
    });
  }
  async function exportDocument() {
    await run("生成 Word 文档", async () => {
      const fresh = await command<TableInfo[]>("read_tables", {
        ids: chosen.map((table) => table.oid),
      });
      if (
        fresh.length !== chosen.length ||
        chosen.some(
          (table) =>
            !fresh.some(
              (value) =>
                value.oid === table.oid && tableKey(value) === tableKey(table),
            ),
        )
      )
        throw new Error("选中表已变化，请刷新后重新选择");
      const ordered = chosen.map((table) =>
        fresh.find((value) => value.oid === table.oid)!,
      );
      const response = await fetch(templateUrl).catch(() => {
        throw new Error("无法读取内置 Word 模板，请重新构建应用");
      });
      if (!response.ok) throw new Error("内置模板读取失败");
      const template = await response.arrayBuffer();
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const worker = new Worker(
          new URL("../lib/document.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = ({ data }) => {
          worker.terminate();
          data.error ? reject(new Error(data.error)) : resolve(data.bytes);
        };
        worker.onerror = () => {
          worker.terminate();
          reject(new Error("文档生成进程失败"));
        };
        worker.postMessage(
          { template, tables: ordered, options: documentOptions },
          { transfer: [template] },
        );
      });
      const path = await save({
        defaultPath: `${documentOptions.projectName.replace(/[\\/:*?"<>|]/g, "_")}-数据库设计说明书.docx`,
        filters: [{ name: "Word 文档", extensions: ["docx"] }],
      });
      if (!path) {
        setNotice({ error: false, text: "已取消保存" });
        return;
      }
      if (
        !path.toLowerCase().endsWith(".docx") ||
        path.endsWith(".template.docx") ||
        path.endsWith("中规院基于AI的城市设计助手数据库设计文档v0.1.docx")
      )
        throw new Error("请选择 .docx 文件，不能覆盖模板或原始母版");
      await writeFile(path, bytes).catch((error) => {
        throw new Error(`文档保存失败：${messageOf(error)}`);
      });
      setOutputPath(path);
      setExportOpen(false);
      setNotice({ error: false, text: "Word 文档已保存" });
    });
  }

  return {
    preferences,
    tables,
    setTables,
    connection,
    setConnection,
    selected,
    setSelected,
    active,
    setActive,
    schema,
    setSchema,
    search,
    setSearch,
    busy,
    notice,
    setNotice,
    connectOpen,
    setConnectOpen,
    aiOpen,
    setAiOpen,
    exportOpen,
    setExportOpen,
    ai,
    background,
    setBackground,
    drafts,
    setDrafts,
    review,
    setReview,
    confirm,
    setConfirm,
    sidebar,
    setSidebar,
    documentOptions,
    setDocumentOptions,
    outputPath,
    results,
    setResults,
    cancelled,
    chosen,
    visible,
    current,
    pendingTables,
    missingCount,
    selectedDrafts,
    writeCount,
    report,
    run,
    toggle,
    connect,
    refresh,
    saveAi,
    generate,
    write,
    exportDocument,
  };
}
export type DatabaseWorkspace = ReturnType<typeof useDatabaseWorkspace>;
