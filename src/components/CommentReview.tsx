import type { Draft } from "../lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";
export interface ReviewDraft extends Draft {
  edits: Record<string, { selected: boolean; text: string }>;
}
export function CommentReview({
  drafts,
  disabled,
  onChange,
  onDiscard,
}: {
  drafts: ReviewDraft[];
  disabled: boolean;
  onChange: (
    id: string,
    target: string,
    change: { selected?: boolean; text?: string },
  ) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <div className="review-list">
      {drafts.map((draft) => (
        <section key={draft.id} className="review-table">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{draft.schema}</p>
              <h2>{draft.table}</h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onDiscard(draft.id)}
            >
              放弃建议
            </Button>
          </div>
          {draft.suggestions.map((suggestion) => (
            <div className="review-item" key={suggestion.id}>
              <Checkbox
                aria-label={`写入 ${draft.schema}.${draft.table}.${suggestion.target}`}
                checked={draft.edits[suggestion.id].selected}
                disabled={disabled}
                onCheckedChange={(value) =>
                  onChange(draft.id, suggestion.id, {
                    selected: value === true,
                  })
                }
              />
              <div className="min-w-0 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <label
                    htmlFor={`${draft.id}-${suggestion.id}`}
                    className="font-mono"
                  >
                    {suggestion.target}
                  </label>
                  <Badge variant="outline">
                    {suggestion.original?.trim() || "原注释缺失"}
                  </Badge>
                </div>
                <Textarea
                  id={`${draft.id}-${suggestion.id}`}
                  maxLength={2000}
                  disabled={disabled}
                  value={draft.edits[suggestion.id].text}
                  onChange={(event) =>
                    onChange(draft.id, suggestion.id, {
                      text: event.target.value,
                    })
                  }
                  placeholder={suggestion.reason || "填写注释"}
                />
                {suggestion.reason && (
                  <p className="text-sm text-muted-foreground">
                    {suggestion.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
