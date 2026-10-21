import { isMissing,tableKey } from "../lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Field,FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

import type { DatabaseWorkspace } from "../hooks/useDatabaseWorkspace";
export function TableSidebar({ workspace }: { workspace: DatabaseWorkspace }) {
  const {
    tables,
    selected,
    setSelected,
    active,
    setActive,
    schema,
    setSchema,
    search,
    setSearch,
    busy,
    drafts,
    visible,
    toggle,
  } = workspace;
  return (
    <aside className="table-sidebar">
      <div className="sidebar-controls">
        <div className="sidebar-title">
          <h2>数据表</h2>
          <Badge variant="secondary">{tables.length}</Badge>
        </div>
        <Field>
          <FieldLabel className="sr-only" htmlFor="schema-filter">
            Schema 筛选
          </FieldLabel>
          <select
            id="schema-filter"
            className="native-select"
            value={schema}
            disabled={!!busy}
            onChange={(event) => setSchema(event.target.value)}
          >
            <option value="">全部 Schema</option>
            {[...new Set(tables.map((table) => table.schema))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Input
          aria-label="搜索数据表"
          placeholder="搜索表名或注释"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy || !visible.length}
            onClick={() =>
              setSelected((previous) => [
                ...new Set([...previous, ...visible.map(tableKey)]),
              ])
            }
          >
            全选结果
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy || !visible.length}
            onClick={() =>
              setSelected((previous) => [
                ...previous.filter(
                  (key) => !visible.some((table) => tableKey(table) === key),
                ),
                ...visible
                  .filter((table) => !previous.includes(tableKey(table)))
                  .map(tableKey),
              ])
            }
          >
            反选
          </Button>
        </div>
      </div>
      <div className="table-list">
        {visible.map((table) => (
          <div
            key={tableKey(table)}
            className="table-list-row"
            data-active={active === tableKey(table)}
          >
            <Checkbox
              checked={selected.includes(tableKey(table))}
              disabled={!!busy}
              aria-label={`选择 ${table.schema}.${table.name}`}
              onCheckedChange={() => toggle(table)}
            />
            <button
              className="table-name"
              onClick={() => setActive(tableKey(table))}
            >
              <span>{table.name}</span>
              <small>{table.comment?.trim() || <span className="text-muted-foreground">暂无表注释</span>}</small>
            </button>
            {drafts.some((draft) => draft.schema === table.schema && draft.table === table.name) &&
              <span className="draft-dot" title="AI 建议待确认" aria-label="AI 建议待确认" />}
            {(isMissing(table.comment) ||
              table.columns.some((column) => isMissing(column.comment))) && (
              <span className="missing-dot" title="存在缺失注释" />
            )}
          </div>
        ))}
        {!visible.length && (
          <p className="sidebar-empty">
            {tables.length ? "没有匹配的数据表" : "连接后显示数据表"}
          </p>
        )}
      </div>
    </aside>
  );
}
