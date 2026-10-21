import type { ReviewDraft, TableInfo } from "../lib/types";
import { CommentValue } from "./CommentValue";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from "./ui/table";
export function StructureView({ table, draft, busy, currentSelectableCount, currentSelectedCount, onToggleSelect, onChange, onDiscard, onManualSave }: {
  table: TableInfo;
  draft?: ReviewDraft;
  busy: boolean;
  currentSelectableCount: number;
  currentSelectedCount: number;
  onToggleSelect: () => void;
  onChange: (id: string, target: string, change: { selected?: boolean; text?: string }) => void;
  onDiscard: (id: string) => void;
  onManualSave: (table: TableInfo, target: string, text: string) => Promise<boolean>;
}) {
  const tableSuggestion = draft?.suggestions.find((suggestion) => suggestion.id === "table");
  return (
    <section className="structure-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{table.schema}</p>
          <h2>{table.name}</h2>
          <div className="table-comment">
            <span className="text-muted-foreground">表注释</span>
            <CommentValue table={table} target="table" comment={table.comment} draft={draft}
              suggestion={tableSuggestion} disabled={busy} onChange={onChange} onSave={onManualSave} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="secondary">{table.columns.length} 个字段</Badge>
          {draft && currentSelectableCount > 0 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onToggleSelect}>
              {currentSelectedCount === currentSelectableCount
                ? "取消本表勾选"
                : `勾选本表建议 · ${currentSelectableCount}`}
            </Button>
          )}
          {draft && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDiscard(draft.id)}>放弃本表建议</Button>}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>字段</TableHead>
            <TableHead>数据类型</TableHead>
            <TableHead>约束</TableHead>
            <TableHead>注释</TableHead>
            <TableHead>默认值</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.columns.map((column) => (
            <TableRow key={column.position}>
              <TableCell className="font-mono">{column.name}</TableCell>
              <TableCell className="font-mono">{column.dataType}</TableCell>
              <TableCell>
                {[
                  column.primaryKey ? "主键" : "",
                  column.notNull ? "非空" : "",
                  column.identity ? "标识列" : "",
                  column.generated ? "生成列" : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </TableCell>
              <TableCell className="whitespace-normal min-w-40">
                <CommentValue table={table} target={`column:${column.position}`} comment={column.comment}
                  draft={draft} suggestion={draft?.suggestions.find((suggestion) => suggestion.id === `column:${column.position}`)}
                  disabled={busy} onChange={onChange} onSave={onManualSave} />
              </TableCell>
              <TableCell className="font-mono whitespace-normal max-w-60 break-all">
                {column.defaultValue || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
