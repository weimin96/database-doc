import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
const container = `database-doc-check-${randomUUID().slice(0, 8)}`;
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr?.trim() || "Docker 执行失败");
  return result.stdout.trim();
}
let created = false;
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_USER=database_doc_check",
    "-e",
    "POSTGRES_DB=database_doc_check",
    "-p",
    "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      spawnSync(
        "docker",
        ["exec", container, "pg_isready", "-U", "database_doc_check"],
        { stdio: "ignore" },
      ).status === 0
    ) {
      ready = true;
      break;
    }
    await setTimeout(250);
  }
  if (!ready) throw new Error("专用 PostgreSQL 验证容器未能就绪");
  const port = docker(["port", container, "5432/tcp"]).split(":").at(-1);
  const result = spawnSync(
    "cargo",
    [
      "test",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--lib",
      "--",
      "--include-ignored",
      "--test-threads=1",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_DOC_VERIFY_URL: `postgres://database_doc_check@127.0.0.1:${port}/database_doc_check`,
      },
    },
  );
  if (result.status !== 0) throw new Error("PostgreSQL 专项验证失败");
} finally {
  if (created) docker(["stop", container]);
}
