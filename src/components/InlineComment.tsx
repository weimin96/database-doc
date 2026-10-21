import type { ReviewDraft, Suggestion } from "../lib/types";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";

/** AI 注释仅为临时建议；只有明确勾选并确认后才会写入数据库。 */
export function InlineComment({ draft, suggestion, disabled, onChange }: {
  draft: ReviewDraft;
  suggestion: Suggestion;
  disabled: boolean;
  onChange: (id: string, target: string, change: { selected?: boolean; text?: string }) => void;
}) {
  const edit = draft.edits[suggestion.id];
  if (!edit) return null;
  return (
    <div className="inline-comment" aria-label={`${suggestion.target} 的 AI 注释建议`}>
      <div className="inline-comment-heading">
        <span title={suggestion.reason ?? undefined}>AI 建议 · 未保存</span>
        <label className="inline-comment-select">
          <Checkbox
            checked={edit.selected}
            disabled={disabled || !edit.text.trim()}
            onCheckedChange={(value) => onChange(draft.id, suggestion.id, { selected: value === true })}
            aria-label={`确认写入 ${draft.schema}.${draft.table}.${suggestion.target} 注释`}
          />
          写入
        </label>
      </div>
      <Textarea
        aria-label={`编辑 ${suggestion.target} 的 AI 注释`}
        rows={2}
        maxLength={2000}
        disabled={disabled}
        value={edit.text}
        onChange={(event) => onChange(draft.id, suggestion.id, { text: event.target.value })}
        placeholder="填写注释后勾选写入"
      />
    </div>
  );
}
