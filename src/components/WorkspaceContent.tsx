import { CheckCheck, Database, Plus } from "lucide-react";
import { StructureView } from "./StructureView";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";

import type { DatabaseWorkspace } from "../hooks/useDatabaseWorkspace";
export function WorkspaceContent({
  workspace,
}: {
  workspace: DatabaseWorkspace;
}) {
  const {
    connection,
    busy,
    notice,
    toast,
    setConnectOpen,
    currentDraft,
    currentPending,
    updateDraft,
    saveManualComment,
    discardDraft,
    prepareGenerate,
    setConfirm,
    current,
    pendingTables,
    chosen,
    scanMissingComments,
    scanReport,
    scanFilter,
    setScanFilter,
    scanTargets,
    generationFailures,
    failedTargets,
    clearScan,
    setSidebar,
    writeCount,
    selectableCount,
    currentSelectableCount,
    currentSelectedCount,
    toggleBulkWriteSelection,
  } = workspace;
  return (
    <main className="main-workspace">
      <div className="workspace-toolbar">
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || !currentPending.length}
            onClick={() => prepareGenerate("current")}
          >
            AI 补全当前表
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy || !pendingTables.length}
            onClick={() => prepareGenerate("selected")}>批量补全已选 · {pendingTables.length}</Button>
          <Button size="sm" variant="outline" disabled={!!busy || !chosen.length}
            title={`检查已选中的 ${chosen.length} 张表，筛选缺少表注释或字段注释的表`}
            onClick={() => { setSidebar(true); void scanMissingComments(); }}>
            检查缺失注释
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" disabled={!!busy || !selectableCount}
            title="批量勾选所有已生成、内容有效的 AI 建议；不会立即写入数据库"
            onClick={() => toggleBulkWriteSelection("all")}>
            <CheckCheck />
            {selectableCount > 0 && writeCount === selectableCount
              ? `取消全部勾选 · ${writeCount}`
              : `全选 AI 建议 · ${selectableCount}`}
          </Button>
          <Button size="sm" disabled={!!busy || !writeCount} onClick={() => setConfirm("write")}>
            写入已勾选 · {writeCount}
          </Button>
        </div>
      </div>
      {scanReport && (
        <section className="scan-result" aria-label="注释扫描结果">
          <div className="scan-result-head">
            <strong>扫描完成 · {scanReport.scanned} 张表</strong>
            <span>缺表注释 {scanReport.tableMissingCount} 张，缺字段注释 {scanReport.columnMissingTableCount} 张 / {scanReport.columnMissingCount} 个字段</span>
            <Button size="sm" variant="ghost" onClick={clearScan}>退出筛选</Button>
          </div>
          <div className="scan-result-actions">
            <div className="scan-filters" role="group" aria-label="按缺失类型筛选">
              {([
                ["missing", "全部缺失", scanReport.entries.filter((item) => item.tableMissing || item.missingColumns > 0).length],
                ["table", "缺表注释", scanReport.tableMissingCount],
                ["column", "缺字段注释", scanReport.columnMissingTableCount],
              ] as const).map(([filter, label, count]) => (
                <Button key={filter} size="sm" variant={scanFilter === filter ? "secondary" : "ghost"}
                  aria-pressed={scanFilter === filter} onClick={() => setScanFilter(filter)}>{label} · {count}</Button>
              ))}
            </div>
            <Button size="sm" disabled={!!busy || !scanTargets.length}
              onClick={() => prepareGenerate("scan")}>AI 补全筛选结果 · {scanTargets.length}</Button>
          </div>
          <p className="scan-hint">仅筛出勾选范围内缺注释的表；AI 会补全这些表的缺失表注释和字段注释，不覆盖已有注释。已有 AI 草稿可在表结构页继续审阅。</p>
        </section>
      )}
      {generationFailures.length > 0 && (
        <section className="generation-failures" aria-label="AI 批量生成失败表">
          <div className="generation-failure-summary">
            <span>AI 生成失败 {generationFailures.length} 张表，已成功生成的建议仍可审阅。</span>
            <Button size="sm" variant="outline" disabled={!!busy || !failedTargets.length}
              onClick={() => prepareGenerate("failed")}>
              重试失败表 · {failedTargets.length}
            </Button>
          </div>
          <details>
            <summary>查看失败原因</summary>
            <ul>
              {generationFailures.map((failure) => (
                <li key={failure.key}>
                  <span>{failure.label}</span>
                  <span>{failure.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {notice && (
        <Alert
          variant={notice.error ? "destructive" : "default"}
          className="workspace-notice"
        >
          <AlertDescription className="whitespace-pre-wrap break-words">
            {notice.text}
          </AlertDescription>
        </Alert>
      )}
      {toast && <div className="success-toast" role="status" aria-live="polite">{toast}</div>}
      {current ? (
        <StructureView table={current} draft={currentDraft} busy={!!busy}
          currentSelectableCount={currentSelectableCount} currentSelectedCount={currentSelectedCount}
          onToggleSelect={() => toggleBulkWriteSelection("current")}
          onChange={updateDraft} onDiscard={discardDraft} onManualSave={saveManualComment} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database />
            </EmptyMedia>
            <EmptyTitle>
              {connection ? "选择一张数据表" : "从数据库结构开始"}
            </EmptyTitle>
            <EmptyDescription>
              {connection
                ? "查看字段、注释与约束，勾选需要导出的表。"
                : "连接 PostgreSQL，整理表和字段注释，导出数据库设计说明书。"}
            </EmptyDescription>
          </EmptyHeader>
          {!connection && (
            <EmptyContent>
              <Button onClick={() => setConnectOpen(true)}>
                <Plus data-icon="inline-start" />
                连接数据库
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}
    </main>
  );
}
