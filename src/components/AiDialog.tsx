import { useEffect, useState } from "react";
import { command, messageOf } from "../lib/api";
import type { AiSettings } from "../lib/types";
import { FormInput } from "./FormInput";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function AiDialog({
  open,
  onOpenChange,
  settings,
  error,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AiSettings;
  error: string;
  busy: boolean;
  onSave: (settings: AiSettings) => Promise<void>;
}) {
  const [value, setValue] = useState(settings);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  useEffect(() => {
    if (open) {
      setValue(settings);
      setModels([]);
      setFeedback(null);
    }
  }, [open, settings]);
  useEffect(() => {
    if (!open || !value.baseUrl.trim()) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setModels([]);
    setFeedback(null);
    const timer = setTimeout(() => {
      void command<string[]>("list_ai_models", {
        settings: { ...value, model: "" },
      })
        .then((ids) => {
          if (!active) return;
          setModels(ids);
          setValue((current) => ({
            ...current,
            model: ids.includes(current.model) ? current.model : ids[0],
          }));
        })
        .catch((reason) => {
          if (active) {
            setValue((current) => ({ ...current, model: "" }));
            setFeedback({ error: true, text: messageOf(reason) });
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, value.baseUrl, value.apiKey, refresh]);
  const locked = busy || testing;
  const ready = !loading && models.includes(value.model);
  function changeAddress(baseUrl: string) {
    setValue({ ...value, baseUrl, model: "", apiKey: "" });
    setModels([]);
    setFeedback(null);
  }
  async function testModel() {
    setTesting(true);
    setFeedback(null);
    try {
      await command("test_ai_connection", { settings: value });
      setFeedback({ error: false, text: `模型连接成功：${value.model}` });
    } catch (reason) {
      setFeedback({ error: true, text: messageOf(reason) });
    } finally {
      setTesting(false);
    }
  }
  const notice = feedback ?? (error ? { error: true, text: error } : null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!locked) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI 服务设置</DialogTitle>
          <DialogDescription>
            使用 OpenAI 兼容接口，模型列表根据 API 地址获取。
          </DialogDescription>
        </DialogHeader>
        {notice && (
          <Alert variant={notice.error ? "destructive" : "default"}>
            <AlertDescription className="break-words">
              {notice.text}
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) {
              setFeedback(null);
              void onSave(value);
            }
          }}
        >
          <fieldset disabled={locked} className="flex flex-col gap-5">
            <FieldGroup>
              <FormInput
                label="API 地址"
                required
                type="url"
                placeholder="https://api.example.com/v1"
                value={value.baseUrl}
                onChange={(event) => changeAddress(event.target.value)}
              />
              <FormInput
                label="API 密钥"
                autoComplete="off"
                type="password"
                value={value.apiKey}
                onChange={(event) => {
                  setValue({ ...value, apiKey: event.target.value, model: "" });
                  setModels([]);
                  setFeedback(null);
                }}
              />
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="ai-model">模型</FieldLabel>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    disabled={!value.baseUrl.trim() || loading}
                    onClick={() => setRefresh((current) => current + 1)}
                  >
                    {loading ? "正在获取…" : "刷新模型"}
                  </Button>
                </div>
                <Select
                  value={value.model}
                  disabled={!models.length || loading}
                  onValueChange={(model) => {
                    setValue({ ...value, model });
                    setFeedback(null);
                  }}
                >
                  <SelectTrigger
                    id="ai-model"
                    aria-label="模型"
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={loading ? "正在获取模型…" : "等待获取模型"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                disabled={!ready}
                onClick={() => void testModel()}
              >
                {testing ? "正在测试…" : "测试模型连接"}
              </Button>
              <Button type="submit" disabled={!ready}>
                保存设置
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
