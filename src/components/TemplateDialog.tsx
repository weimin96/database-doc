import { useState } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import type { TemplateEntry } from "../lib/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function TemplateDialog({ open, onOpenChange, templates, activeId, onSelect, onImport, onDelete, onDownload }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  templates: TemplateEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  onImport: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDownload: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  async function perform(action: () => Promise<void>) {
    setError(""); setPending("busy");
    try { await action(); setConfirmDelete(""); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPending(""); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!pending) { onOpenChange(value); setError(""); } }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Word 模板管理</DialogTitle>
        <DialogDescription>内置模板源自项目现有数据库设计说明书。可导出副本在 Word/WPS 中编辑后重新导入。</DialogDescription></DialogHeader>
      <div className="template-actions">
        <Button variant="outline" disabled={!!pending} onClick={() => void perform(onDownload)}><Download data-icon="inline-start"/>下载模板示例</Button>
        <Button variant="outline" disabled={!!pending} onClick={() => void perform(onImport)}><Plus data-icon="inline-start"/>导入 DOCX 模板</Button>
      </div>
      <div className="template-items">
        {templates.map((template) => <div key={template.id} className="template-item">
          <FileText className="shrink-0" />
          <div className="template-item-name"><strong>{template.name}</strong><small>{template.builtin ? "内置 · 不可删除" : "自定义模板"}</small></div>
          <Button size="sm" variant={activeId === template.id ? "secondary" : "outline"} disabled={!!pending}
            onClick={() => onSelect(template.id)}>{activeId === template.id ? "使用中" : "使用"}</Button>
          {!template.builtin && <Button size="icon-sm" variant="ghost" disabled={!!pending} aria-label={`删除${template.name}`}
            onClick={() => confirmDelete === template.id ? void perform(() => onDelete(template.id)) : setConfirmDelete(template.id)}>
            {confirmDelete === template.id ? <span className="text-xs">确定</span> : <Trash2 />}</Button>}
        </div>)}
      </div>
      <div className="template-help">
        <strong>Word 模板语法</strong>
        <p><code>{'{projectName}'}</code> 项目名称 · <code>{'{organization}'}</code> 建设单位 · <code>{'{version}'}</code> 版本 · <code>{'{date}'}</code> 日期 · <code>{'{overview}'}</code> 概述 · <code>{'{tableCount}'}</code> 表数量 · <code>{'{schemaNames}'}</code> Schema 列表</p>
        <p>循环：<code>{'{#tables}'}</code> … <code>{'{/tables}'}</code>；嵌套字段：<code>{'{#columns}'}</code> … <code>{'{/columns}'}</code>。</p>
        <p>判断：<code>{'{#isPrimaryKey}√{/isPrimaryKey}'}</code>；取反：<code>{'{^hasComment}未填写{/hasComment}'}</code>；比较：<code>{'{#columnCount > 5}字段较多{/}'}</code>。</p>
        <p>整块循环标记应分别独占段落，表格数据行循环应放在首末单元格。建议下载内置模板副本后修改，以保留原始版式和目录域。</p>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </DialogContent>
  </Dialog>;
}
