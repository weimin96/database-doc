import { useEffect, useState } from "react";
import { Database, Plus, Trash2 } from "lucide-react";
import type { Project } from "../lib/types";
import type { SavedConnection } from "../lib/api";
import { FormInput } from "./FormInput";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

export function ProjectDialog({ open, onOpenChange, projects, current, savedConnections, busy, requireSelection, onCreate, onSwitch, onSave, onRemove }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  projects: Project[];
  current?: Project;
  savedConnections: SavedConnection[];
  busy: boolean;
  requireSelection: boolean;
  onCreate: () => Promise<void>;
  onSwitch: (id: string) => Promise<void>;
  onSave: (data: Project) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setDraft(current ? { ...current } : null); setConfirmDelete(false); setError(""); }, [current?.id, open]);
  const update = (key: keyof Project, value: string) => setDraft((prev) => prev && ({ ...prev, [key]: value }));
  const associatedConnection = savedConnections.find((item) => item.id === draft?.connectionId);
  async function execute(action: () => Promise<void>) {
    setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return (
    <Dialog open={open} onOpenChange={(value) => !busy && (value || !requireSelection) && onOpenChange(value)}>
      <DialogContent className="project-dialog" showCloseButton={!requireSelection} aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (requireSelection) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (requireSelection) event.preventDefault(); }}>
        <DialogHeader className="project-dialog-header">
          <DialogTitle>{requireSelection ? "打开或创建项目" : "项目管理"}</DialogTitle>
        </DialogHeader>
        <div className="project-manager">
          <aside className="project-list">
            <span className="project-list-heading">我的项目</span>
            <Button type="button" variant="outline" className="project-create-button" disabled={busy}
              onClick={() => void execute(onCreate)}><Plus data-icon="inline-start"/>新建项目</Button>
            {projects.map((item) => (
              <button key={item.id} type="button" className="project-list-item" data-active={current?.id === item.id} disabled={busy}
                aria-current={current?.id === item.id ? "true" : undefined}
                title={item.name || "新项目"} onClick={() => void execute(() => onSwitch(item.id))}>
                <span>{item.name || "新项目"}</span>
              </button>
            ))}
          </aside>
          {draft && <form className="project-form" onSubmit={(event) => {
            event.preventDefault();
            if (!draft.name.trim()) { setError("请输入项目名称"); return; }
            void execute(async () => {
              await onSave({ ...draft, name: draft.name.trim() });
              onOpenChange(false);
            });
          }}>
            <fieldset disabled={busy} className="project-fields">
              <FormInput label="项目名称" required value={draft.name} onChange={(e) => update("name", e.target.value)} />
              <div className="project-connection" title={associatedConnection?.label ?? "当前项目尚未关联数据库"}>
                <Database size={15} className="project-connection-icon" />
                <span className="project-connection-name">{associatedConnection?.label ?? "尚未关联数据库"}</span>
                {draft.selectedTables.length > 0 && <span className="project-table-count">已选 {draft.selectedTables.length} 张表</span>}
              </div>
              <FormInput label="建设单位" value={draft.organization} onChange={(e) => update("organization", e.target.value)} />
              <div className="project-field-row">
                <FormInput label="文档版本" value={draft.version} onChange={(e) => update("version", e.target.value)} />
                <FormInput label="编制日期" type="date" value={draft.date} onChange={(e) => update("date", e.target.value)} />
              </div>
              <Field><FieldLabel htmlFor="project-overview">项目概述</FieldLabel>
                <Textarea id="project-overview" rows={3} value={draft.overview} onChange={(e) => update("overview", e.target.value)} /></Field>
              {error && <p className="form-error" role="alert">{error}</p>}
            </fieldset>
            <div className="project-actions">
              <Button variant="ghost" type="button" disabled={busy || projects.length <= 1} onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                void execute(() => onRemove(draft.id));
              }}><Trash2 data-icon="inline-start" />{confirmDelete ? "确认删除" : "删除项目"}</Button>
              <Button type="submit" disabled={busy || !draft.name.trim()}>
                {requireSelection ? "保存并进入项目" : "保存修改"}
              </Button>
            </div>
          </form>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
