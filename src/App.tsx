import {
  Database,
  FileDown,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  FolderOpen,
  Files,
  RefreshCw,
  Settings2,
  Unplug,
} from "lucide-react";
import { AiDialog } from "./components/AiDialog";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { ExportDialog } from "./components/ExportDialog";
import { ProjectDialog } from "./components/ProjectDialog";
import { TemplateDialog } from "./components/TemplateDialog";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { command, desktop } from "./lib/api";

import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { TableSidebar } from "./components/TableSidebar";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { useDatabaseWorkspace } from "./hooks/useDatabaseWorkspace";
export default function App() {
  const workspace = useDatabaseWorkspace();
  const {
    preferences,
    project,
    projects,
    projectReady,
    projectOpen,
    setProjectOpen,
    templateOpen,
    setTemplateOpen,
    templates,
    createProject,
    switchProject,
    removeProject,
    importCustomTemplate,
    deleteCustomTemplate,
    downloadBuiltinTemplate,
    updateCurrent,
    tables,
    setTables,
    connection,
    setConnection,
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
    setDrafts,
    sidebar,
    setSidebar,
    documentOptions,
    setDocumentOptions,
    setResults,
    cancelled,
    chosen,
    run,
    connect,
    refresh,
    saveAi,
    exportDocument,
  } = workspace;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Database />
          </span>
          <div>
            <h1>Database Doc</h1>
            <p>数据库文档工作台</p>
          </div>
        </div>
        <div className="header-actions">
          <Button variant="outline" onClick={() => setProjectOpen(true)} disabled={!!busy || !projectReady}>
            <FolderOpen data-icon="inline-start" />
            <span className="header-project-name">{project?.name || "未命名项目"}</span>
          </Button>
          <Button variant="ghost" onClick={() => setTemplateOpen(true)} disabled={!!busy || !projectReady}>
            <Files data-icon="inline-start" />模板
          </Button>
          <Button
            variant="ghost"
            onClick={() => setAiOpen(true)}
            disabled={!!busy}
          >
            <Settings2 data-icon="inline-start" />
            AI 设置
          </Button>
          <Button
            variant="outline"
            onClick={() => setConnectOpen(true)}
            disabled={!!busy || !projectReady}
          >
            <Plus data-icon="inline-start" />
            {connection ? "切换连接" : "连接数据库"}
          </Button>
          <Button
            onClick={() => setExportOpen(true)}
            disabled={!!busy || !chosen.length}
          >
            <FileDown data-icon="inline-start" />
            导出 Word
          </Button>
        </div>
      </header>
      {!desktop && (
        <Alert className="preview-alert">
          <AlertTitle>浏览器预览</AlertTitle>
          <AlertDescription>
            数据库连接、AI 请求和文件保存需在桌面应用中使用。
          </AlertDescription>
        </Alert>
      )}
      <div className="connection-bar">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={sidebar ? "收起表列表" : "展开表列表"}
          onClick={() => setSidebar(!sidebar)}
        >
          {sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <span className="connection-label">
          {connection || "未连接 PostgreSQL"}
        </span>
        {connection && (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!!busy}
              aria-label="刷新结构"
              onClick={() => void refresh()}
            >
              <RefreshCw />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!!busy}
              aria-label="断开连接"
              onClick={() =>
                void run("断开连接", async () => {
                  await command("disconnect_database");
                  setConnection("");
                  setTables([]);
                  setDrafts([]);
                  setResults([]);
                })
              }
            >
              <Unplug />
            </Button>
          </>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {tables.length} 张表 · 已选 {chosen.length} 张
        </span>
      </div>
      <div className={sidebar ? "workspace" : "workspace sidebar-collapsed"}>
        {sidebar && <TableSidebar workspace={workspace} />}
        <WorkspaceContent workspace={workspace} />
      </div>
      <footer className="statusbar" role="status">
        {busy ? (
          <>
            <LoaderCircle className="activity" />
            {busy}
            {(busy.startsWith("生成注释") || busy.startsWith("写入")) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  cancelled.current = true;
                  setNotice({
                    error: false,
                    text: "已请求停止，当前表处理完成后不再执行后续表",
                  });
                }}
              >
                停止后续处理
              </Button>
            )}
          </>
        ) : (
          <>
            <span>{connection ? "已连接" : "就绪"}</span>
            <span className="ml-auto">PostgreSQL · 本地文档导出</span>
          </>
        )}
      </footer>
      <ConnectionDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        saved={preferences.connections}
        preferredId={project?.connectionId}
        error={notice?.error ? notice.text : ""}
        busy={!!busy}
        onConnect={connect}
      />
      <AiDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        settings={ai}
        error={notice?.error ? notice.text : ""}
        busy={!!busy}
        onSave={saveAi}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        options={documentOptions}
        onChange={setDocumentOptions}
        onExport={() => void exportDocument()}
        busy={!!busy}
        count={chosen.length}
        error={notice?.error ? notice.text : ""}
        templates={templates}
        templateId={project?.templateId || "builtin"}
        onTemplateChange={(id) => updateCurrent((item) => ({ ...item, templateId: id }))}
        onManageTemplates={() => { setExportOpen(false); setTemplateOpen(true); }}
      />
      <ProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        projects={projects}
        current={project}
        busy={!!busy}
        onCreate={createProject}
        onSwitch={switchProject}
        onSave={(value) => updateCurrent((item) => ({ ...item, ...value }))}
        onRemove={removeProject}
      />
      <TemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        templates={templates}
        activeId={project?.templateId || "builtin"}
        onSelect={(id) => updateCurrent((item) => ({ ...item, templateId: id }))}
        onImport={importCustomTemplate}
        onDelete={deleteCustomTemplate}
        onDownload={downloadBuiltinTemplate}
      />
      <ConfirmationDialog workspace={workspace} />
    </div>
  );
}
