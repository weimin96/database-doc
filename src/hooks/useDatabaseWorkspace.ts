import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import templateUrl from "../../templates/database-design.template.docx?url";
import type { ReviewDraft } from "../components/CommentReview";
import { validateTemplate } from "../lib/template";
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
  type Project,
  type TemplateEntry,
  type WorkspaceStore,
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
const newProject = (): Project => ({
  name: "",
  organization: initialOptions.organization,
  version: initialOptions.version,
  date: initialOptions.date,
  overview: initialOptions.overview,
  id: crypto.randomUUID(),
  connectionId: null,
  templateId: "builtin",
  selectedTables: [],
});
export function useDatabaseWorkspace() {
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [connection, setConnection] = useState("");
  const [selected, setSelectedState] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  const [projectStore, setProjectStore] = useState<WorkspaceStore>({ projects: [], activeProjectId: "" });
  const projectStoreRef = useRef(projectStore);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [projectReady, setProjectReady] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateEntry[]>([{ id: "builtin", name: "数据库设计说明书（内置）", builtin: true }]);
  const [connectedProfileId, setConnectedProfileId] = useState<string | null>(null);
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
  const project = projectStore.projects.find((item) => item.id === projectStore.activeProjectId);
  const documentOptions: DocumentOptions = project
    ? { projectName: project.name, organization: project.organization, version: project.version, date: project.date, overview: project.overview }
    : initialOptions;
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
  function updateStore(change: (state: WorkspaceStore) => WorkspaceStore) {
    const next = change(projectStoreRef.current);
    projectStoreRef.current = next;
    setProjectStore(next);
    const saving = saveQueue.current
      .catch(() => undefined)
      .then(() => command<void>("save_workspace", { workspace: next }));
    saveQueue.current = saving.catch(report);
    return saving;
  }
  function updateCurrent(change: (project: Project) => Project) {
    return updateStore((state) => ({
      ...state,
      projects: state.projects.map((item) => item.id === state.activeProjectId ? change(item) : item),
    }));
  }
  function setSelected(value: SetStateAction<string[]>) {
    const next = typeof value === "function" ? value(selectionRef.current) : value;
    selectionRef.current = next;
    setSelectedState(next);
    updateCurrent((item) => ({ ...item, selectedTables: next }));
  }
  function restoreSelection(keys: string[]) {
    selectionRef.current = keys;
    setSelectedState(keys);
  }
  function setDocumentOptions(value: DocumentOptions) {
    updateCurrent((item) => ({ ...item, name: value.projectName, organization: value.organization, version: value.version, date: value.date, overview: value.overview }));
  }
  async function createProject() {
    await run("创建项目", async () => {
      // 切换项目前断开旧会话，避免误将不同数据库中的同名表导出。
      if (connection) await command("disconnect_database");
      setConnection(""); setConnectedProfileId(null); setTables([]);
      setDrafts([]); setResults([]); setActive("");
      const created = newProject();
      await updateStore((state) => ({ projects: [...state.projects, created], activeProjectId: created.id }));
      restoreSelection([]);
    });
  }
  async function switchProject(id: string) {
    if (id === projectStoreRef.current.activeProjectId) return;
    await run("切换项目", async () => {
      if (connection) await command("disconnect_database");
      setConnection("");
      setConnectedProfileId(null);
      setTables([]);
      setActive("");
      setDrafts([]);
      setResults([]);
      const next = projectStoreRef.current.projects.find((item) => item.id === id);
      if (!next) throw new Error("项目不存在");
      await updateStore((state) => ({ ...state, activeProjectId: id }));
      restoreSelection([]);
      setProjectOpen(false);
    });
  }
  async function removeProject(id: string) {
    if (projectStoreRef.current.projects.length <= 1) throw new Error("至少保留一个项目");
    if (projectStoreRef.current.activeProjectId === id && connection) {
      await command("disconnect_database");
      setConnection(""); setTables([]); setConnectedProfileId(null);
      restoreSelection([]); setDrafts([]); setResults([]);
    }
    await updateStore((state) => {
      const projects = state.projects.filter((item) => item.id !== id);
      return { projects, activeProjectId: state.activeProjectId === id ? projects[0].id : state.activeProjectId };
    });
  }
  async function importCustomTemplate() {
    const path = await open({ multiple: false, filters: [{ name: "Word 模板", extensions: ["docx"] }] });
    if (!path) return;
    const bytes = await readFile(path);
    validateTemplate(bytes);
    const name = path.split(/[/\\]/).pop()?.replace(/\.docx$/i, "") || "自定义模板";
    const item = await command<TemplateEntry>("import_template", { name, bytes: Array.from(bytes) });
    setTemplates((items) => [...items, item]);
    await updateCurrent((project) => ({ ...project, templateId: item.id }));
  }
  async function deleteCustomTemplate(id: string) {
    if (id === "builtin") throw new Error("内置模板不能删除");
    // 删除前更新项目引用，保证下次启动不会引用已删除的模板。
    await updateStore((state) => ({ ...state, projects: state.projects.map((item) => item.templateId === id ? { ...item, templateId: "builtin" } : item) }));
    await command("delete_template", { id });
    setTemplates((items) => items.filter((item) => item.id !== id));
  }
  async function downloadBuiltinTemplate() {
    const response = await fetch(templateUrl);
    if (!response.ok) throw new Error("读取内置模板失败");
    const target = await save({ defaultPath: "数据库设计说明书-模板.docx", filters: [{ name: "Word 模板", extensions: ["docx"] }] });
    if (target) await writeFile(target, new Uint8Array(await response.arrayBuffer()));
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
    command<WorkspaceStore>("load_workspace")
      .then(async (loaded) => {
        const projects = loaded.projects.length ? loaded.projects : [newProject()];
        const activeProjectId = projects.some((item) => item.id === loaded.activeProjectId) ? loaded.activeProjectId : projects[0].id;
        const next = { projects, activeProjectId };
        if (!loaded.projects.length) await command("save_workspace", { workspace: next });
        projectStoreRef.current = next;
        setProjectStore(next);
        setProjectReady(true);
      })
      .catch(report);
    command<TemplateEntry[]>("list_templates").then(setTemplates).catch(report);
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
      setConnectedProfileId(saveConnection ? id : null);
      setDrafts([]);
      setResults([]);
      const savedSelection = saveConnection && projectStoreRef.current.projects.find((item) => item.id === projectStoreRef.current.activeProjectId)?.connectionId === id
        ? projectStoreRef.current.projects.find((item) => item.id === projectStoreRef.current.activeProjectId)?.selectedTables ?? [] : [];
      const restored = savedSelection.filter((key) => loaded.some((table) => tableKey(table) === key));
      restoreSelection(restored);
      setActive(loaded[0] ? tableKey(loaded[0]) : "");
      setSchema("");
      setReview(false);
      setConnectOpen(false);
      await updateCurrent((item) => ({ ...item, connectionId: saveConnection ? id : null, selectedTables: restored }));
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
      if (!project) throw new Error("请先创建项目");
      let template: ArrayBuffer;
      if (project.templateId === "builtin") {
        const response = await fetch(templateUrl).catch(() => { throw new Error("无法读取内置 Word 模板"); });
        if (!response.ok) throw new Error("内置模板读取失败");
        template = await response.arrayBuffer();
      } else {
        const bytes = await command<number[]>("read_template", { id: project.templateId });
        template = new Uint8Array(bytes).buffer;
      }
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
    project,
    projects: projectStore.projects,
    projectReady,
    projectOpen,
    setProjectOpen,
    templateOpen,
    setTemplateOpen,
    templates,
    connectedProfileId,
    createProject,
    switchProject,
    removeProject,
    importCustomTemplate,
    deleteCustomTemplate,
    downloadBuiltinTemplate,
    updateCurrent,
    restoreSelection,
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
