import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Project } from "../lib/types";
import { FormInput } from "./FormInput";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

export function ProjectDialog({ open, onOpenChange, projects, current, busy, onCreate, onSwitch, onSave, onRemove }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  projects: Project[];
  current?: Project;
  busy: boolean;
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
  async function execute(action: () => Promise<void>) {
    setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent className="project-dialog max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>项目管理</DialogTitle>
          <DialogDescription>每个项目独立保存文档信息、数据库连接关联、选中数据表和导出模板。</DialogDescription>
        </DialogHeader>
        <div className="project-manager">
          <aside className="project-list">
            <Button variant="outline" disabled={busy} onClick={() => void execute(onCreate)}><Plus data-icon="inline-start"/>新建项目</Button>
            {projects.map((item) => (
              <button key={item.id} type="button" className="project-list-item" data-active={current?.id === item.id} disabled={busy}
                onClick={() => void execute(() => onSwitch(item.id))}>{item.name || "未命名项目"}</button>
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
            <fieldset disabled={busy} className="flex flex-col gap-3">
              <FormInput label="项目名称" required value={draft.name} onChange={(e) => update("name", e.target.value)} />
              <FormInput label="建设单位" value={draft.organization} onChange={(e) => update("organization", e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="文档版本" value={draft.version} onChange={(e) => update("version", e.target.value)} />
                <FormInput label="编制日期" type="date" value={draft.date} onChange={(e) => update("date", e.target.value)} />
              </div>
              <Field><FieldLabel htmlFor="project-overview">项目概述</FieldLabel>
                <Textarea id="project-overview" rows={4} value={draft.overview} onChange={(e) => update("overview", e.target.value)} /></Field>
              <p className="form-hint">已保存 {draft.selectedTables.length} 张表的选择记录；重新连接对应数据库后可恢复。</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <DialogFooter className="project-actions">
                <Button variant="ghost" type="button" disabled={projects.length <= 1} onClick={() => {
                  if (!confirmDelete) { setConfirmDelete(true); return; }
                  void execute(() => onRemove(draft.id));
                }}><Trash2 data-icon="inline-start" />{confirmDelete ? "确认删除此项目" : "删除项目"}</Button>
                <Button type="submit">保存项目</Button>
              </DialogFooter>
            </fieldset>
          </form>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
