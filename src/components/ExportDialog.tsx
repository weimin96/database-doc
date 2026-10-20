import type { DocumentOptions } from "../lib/types";
import { FormInput } from "./FormInput";
import { Alert,AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "./ui/dialog";
import { Field,FieldGroup,FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";
export function ExportDialog({
  open,
  onOpenChange,
  options,
  onChange,
  onExport,
  busy,
  count,
  error,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  options: DocumentOptions;
  onChange: (value: DocumentOptions) => void;
  onExport: () => void;
  busy: boolean;
  count: number;
  error: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导出数据库设计说明书</DialogTitle>
          <DialogDescription>
            导出 {count} 张表，内容以数据库实际注释为准。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onExport();
          }}
        >
          <fieldset disabled={busy} className="flex flex-col gap-5">
            <FieldGroup>
              <FormInput
                label="项目名称"
                required
                value={options.projectName}
                onChange={(event) =>
                  onChange({ ...options, projectName: event.target.value })
                }
              />
              <FormInput
                label="建设单位"
                value={options.organization}
                onChange={(event) =>
                  onChange({ ...options, organization: event.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="文档版本"
                  value={options.version}
                  onChange={(event) =>
                    onChange({ ...options, version: event.target.value })
                  }
                />
                <FormInput
                  label="编制日期"
                  type="date"
                  value={options.date}
                  onChange={(event) =>
                    onChange({ ...options, date: event.target.value })
                  }
                />
              </div>
              <Field>
                <FieldLabel htmlFor="overview">项目概述</FieldLabel>
                <Textarea
                  id="overview"
                  value={options.overview}
                  onChange={(event) =>
                    onChange({ ...options, overview: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">
                {busy ? "正在生成…" : "选择位置并导出"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
