import { useEffect, useState } from "react";
import { type SavedConnection } from "../lib/api";
import type { ConnectionOptions } from "../lib/types";
import { FormInput } from "./FormInput";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
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

export function ConnectionDialog({
  open,
  onOpenChange,
  saved,
  preferredId,
  error,
  busy,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  saved: SavedConnection[];
  preferredId?: string | null;
  error: string;
  busy: boolean;
  onConnect: (
    options: ConnectionOptions,
    save: boolean,
    id: string,
  ) => Promise<boolean>;
}) {
  const [options, setOptions] = useState<ConnectionOptions>({
    host: "127.0.0.1",
    port: 5432,
    database: "",
    username: "",
    password: "",
    sslmode: "require",
  });
  const [savedId, setSavedId] = useState("new");
  const [save, setSave] = useState(true);
  useEffect(() => {
    if (!open || !preferredId) return;
    const profile = saved.find((item) => item.id === preferredId);
    if (profile) {
      setSavedId(profile.id);
      setOptions({ ...profile, password: "" });
    }
  }, [open, preferredId, saved]);
  useEffect(() => {
    if (!open) setOptions((previous) => ({ ...previous, password: "" }));
  }, [open]);
  const update = (key: keyof ConnectionOptions, value: string | number) =>
    setOptions((previous) => ({ ...previous, [key]: value }));
  function choose(id: string) {
    setSavedId(id);
    const connection = saved.find((connection) => connection.id === id);
    if (connection) setOptions({ ...connection, password: "" });
    else setOptions((previous) => ({ ...previous, password: "" }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOptions((previous) => ({ ...previous, password: "" }));
          onOpenChange(value);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>连接 PostgreSQL</DialogTitle>
          <DialogDescription>
            连接信息保存在本机，密码仅用于本次连接。
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
            void onConnect(
              options,
              save,
              savedId === "new" ? crypto.randomUUID() : savedId,
            ).then((success) => {
              if (success)
                setOptions((previous) => ({ ...previous, password: "" }));
            });
          }}
        >
          <fieldset disabled={busy} className="flex flex-col gap-5">
            <FieldGroup>
              {saved.length > 0 && (
                <Field>
                  <FieldLabel>常用连接</FieldLabel>
                  <Select
                    value={savedId}
                    onValueChange={(value) => void choose(value)}
                  >
                    <SelectTrigger aria-label="常用连接">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="new">新建连接</SelectItem>
                        {saved.map((connection) => (
                          <SelectItem value={connection.id} key={connection.id}>
                            {connection.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <FormInput
                  label="主机"
                  required
                  value={options.host}
                  onChange={(event) => update("host", event.target.value)}
                />
                <FormInput
                  label="端口"
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={options.port}
                  onChange={(event) =>
                    update("port", Number(event.target.value))
                  }
                />
              </div>
              <FormInput
                label="数据库"
                required
                value={options.database}
                onChange={(event) => update("database", event.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="用户名"
                  required
                  value={options.username}
                  onChange={(event) => update("username", event.target.value)}
                />
                <FormInput
                  label="密码"
                  type="password"
                  autoComplete="off"
                  value={options.password}
                  onChange={(event) => update("password", event.target.value)}
                />
              </div>
              <Field>
                <FieldLabel>SSL 模式</FieldLabel>
                <Select
                  value={options.sslmode}
                  onValueChange={(value) => update("sslmode", value)}
                >
                  <SelectTrigger aria-label="SSL 模式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="require">
                        要求加密（require）
                      </SelectItem>
                      <SelectItem value="verify-full">
                        校验证书与主机（verify-full）
                      </SelectItem>
                      <SelectItem value="disable">不加密（disable）</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="save-connection"
                  checked={save}
                  onCheckedChange={(value) => {
                    setSave(value === true);
                  }}
                />
                <FieldLabel htmlFor="save-connection">保存连接信息</FieldLabel>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit">{busy ? "正在连接…" : "测试并连接"}</Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
