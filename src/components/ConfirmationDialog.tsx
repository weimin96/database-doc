import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

import type { DatabaseWorkspace } from "../hooks/useDatabaseWorkspace";
export function ConfirmationDialog({
  workspace,
}: {
  workspace: DatabaseWorkspace;
}) {
  const {
    connection,
    ai,
    background,
    setBackground,
    confirm,
    setConfirm,
    generationTargets,
    selectedDrafts,
    writeCount,
    generate,
    write,
  } = workspace;
  return (
    <Dialog
      open={confirm !== null}
      onOpenChange={(value) => {
        if (!value) setConfirm(null);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {confirm === "generate" ? "确认发送结构信息" : "确认写入数据库注释"}
          </DialogTitle>
          <DialogDescription>
            {confirm === "generate"
              ? `向 ${ai.baseUrl} 的 ${ai.model} 发送 ${generationTargets.length} 张表结构及已有注释，不发送业务记录或连接凭据。`
              : `目标：${connection}。将保存已勾选的 ${writeCount} 项 AI 注释，不覆盖数据库中已有注释。手动编辑注释可在字段旁直接保存。`}
          </DialogDescription>
        </DialogHeader>
        {confirm === "generate" ? (
          <>
            <Field>
              <FieldLabel htmlFor="business-background">
                业务背景（可选）
              </FieldLabel>
              <Textarea
                id="business-background"
                maxLength={4000}
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </Field>
            <details>
              <summary>查看发送的表结构</summary>
              <pre className="payload-preview">
                {JSON.stringify(
                  generationTargets.map((table) => ({
                    schema: table.schema,
                    table: table.name,
                    comment: table.comment,
                    columns: table.columns.map((column) => ({
                      name: column.name,
                      type: column.dataType,
                      primaryKey: column.primaryKey,
                      notNull: column.notNull,
                      comment: column.comment,
                    })),
                  })),
                  null,
                  2,
                )}
              </pre>
            </details>
          </>
        ) : (
          <div className="confirmation-targets">
            {selectedDrafts
              .filter((draft) =>
                Object.values(draft.edits).some((edit) => edit.selected),
              )
              .map((draft) => (
                <p key={draft.id}>
                  {draft.schema}.{draft.table} ·{" "}
                  {
                    Object.values(draft.edits).filter((edit) => edit.selected)
                      .length
                  }{" "}
                  项
                </p>
              ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            取消
          </Button>
          <Button
            onClick={() => void (confirm === "generate" ? generate() : write())}
          >
            {confirm === "generate" ? "发送并生成建议" : "确认写入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
