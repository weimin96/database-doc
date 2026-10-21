import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type { ReviewDraft, Suggestion, TableInfo } from "../lib/types";
import { InlineComment } from "./InlineComment";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

/** 同一位置只展示实际注释、AI 建议、手工编辑三种状态之一。 */
export function CommentValue({ table, target, comment, draft, suggestion, disabled, onChange, onSave }: {
  table: TableInfo;
  target: string;
  comment: string | null;
  draft?: ReviewDraft;
  suggestion?: Suggestion;
  disabled: boolean;
  onChange: (id: string, target: string, change: { selected?: boolean; text?: string }) => void;
  onSave: (table: TableInfo, target: string, text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment ?? "");
  useEffect(() => {
    setValue(comment ?? "");
    setEditing(false);
  }, [comment, table.schema, table.name, target]);
  const label = target === "table" ? "表注释" : `字段 ${table.columns.find((c) => target === `column:${c.position}`)?.name ?? target} 的注释`;

  if (editing) {
    return <div className="manual-comment-editor">
      <Textarea aria-label={`编辑${label}`} rows={2} maxLength={2000} value={value}
        disabled={disabled} onChange={(event) => setValue(event.target.value)} autoFocus />
      <div className="manual-comment-actions">
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setEditing(false); setValue(comment ?? ""); }}>取消</Button>
        <Button type="button" size="sm" disabled={disabled || !value.trim() || value.trim() === (comment ?? "").trim()}
          onClick={async () => { if (await onSave(table, target, value.trim())) setEditing(false); }}>保存注释</Button>
      </div>
    </div>;
  }
  return <div className="comment-value">
    {draft && suggestion
      ? <InlineComment draft={draft} suggestion={suggestion} disabled={disabled} onChange={onChange} />
      : <span className={comment?.trim() ? "comment-text" : "text-muted-foreground"}>{comment?.trim() || "缺失"}</span>}
    <Button type="button" size="icon-sm" variant="ghost" className="comment-edit-button"
      aria-label={`手动编辑${label}`} title="手动编辑注释" disabled={disabled}
      onClick={() => { setValue(comment ?? ""); setEditing(true); }}><Pencil size={14}/></Button>
  </div>;
}
