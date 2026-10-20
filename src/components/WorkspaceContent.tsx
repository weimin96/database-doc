import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Database, Plus, Table2 } from "lucide-react";
import { CommentReview } from "./CommentReview";
import { StructureView } from "./StructureView";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
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
    setConnectOpen,
    setAiOpen,
    ai,
    drafts,
    setDrafts,
    review,
    setReview,
    setConfirm,
    outputPath,
    results,
    current,
    pendingTables,
    missingCount,
    selectedDrafts,
    writeCount,
    report,
  } = workspace;
  return (
    <main className="main-workspace">
      <div className="workspace-toolbar">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={review ? "ghost" : "secondary"}
            onClick={() => setReview(false)}
          >
            表结构
          </Button>
          <Button
            size="sm"
            variant={review ? "secondary" : "ghost"}
            onClick={() => setReview(true)}
          >
            注释审阅{drafts.length ? ` · ${drafts.length}` : ""}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || !pendingTables.length}
            onClick={() =>
              ai.baseUrl && ai.model ? setConfirm("generate") : setAiOpen(true)
            }
          >
            AI 补全{missingCount ? ` · ${missingCount} 项` : ""}
          </Button>
          {review && (
            <Button
              size="sm"
              disabled={!!busy || !writeCount}
              onClick={() => setConfirm("write")}
            >
              写入数据库 · {writeCount}
            </Button>
          )}
        </div>
      </div>
      {notice && (
        <Alert
          variant={notice.error ? "destructive" : "default"}
          className="workspace-notice"
        >
          <AlertDescription className="whitespace-pre-wrap break-words">
            {notice.text}
          </AlertDescription>
          {outputPath && !notice.error && (
            <Button
              size="sm"
              variant="link"
              onClick={() => void revealItemInDir(outputPath).catch(report)}
            >
              在 Finder 中显示
            </Button>
          )}
        </Alert>
      )}
      {results.length > 0 && (
        <div className="write-results" aria-live="polite">
          {results.map((result) => (
            <p key={`${result.schema}.${result.table}`}>
              <Badge
                variant={
                  result.status === "committed" ? "secondary" : "destructive"
                }
              >
                {result.status === "committed"
                  ? "已提交"
                  : result.status === "conflict"
                    ? "冲突"
                    : result.status === "uncertain"
                      ? "待核实"
                      : "失败"}
              </Badge>{" "}
              {result.schema}.{result.table} · {result.message}
            </p>
          ))}
        </div>
      )}
      {review ? (
        selectedDrafts.length ? (
          <CommentReview
            drafts={selectedDrafts}
            disabled={!!busy}
            onDiscard={(id) =>
              setDrafts((previous) =>
                previous.filter((draft) => draft.id !== id),
              )
            }
            onChange={(id, target, change) =>
              setDrafts((previous) =>
                previous.map((draft) =>
                  draft.id === id
                    ? {
                        ...draft,
                        edits: {
                          ...draft.edits,
                          [target]: { ...draft.edits[target], ...change },
                        },
                      }
                    : draft,
                ),
              )
            }
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Table2 />
              </EmptyMedia>
              <EmptyTitle>还没有注释建议</EmptyTitle>
              <EmptyDescription>
                选择数据表后生成缺失注释，审阅并勾选后写回数据库。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : current ? (
        <StructureView table={current} />
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
