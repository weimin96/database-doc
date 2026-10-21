import assert from "node:assert/strict";
import { build } from "esbuild";

const source = await build({
  entryPoints: ["src/lib/commentScan.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { summarizeMissingComments, matchesScanFilter } = await import(
  `data:text/javascript;base64,${Buffer.from(source.outputFiles[0].contents).toString("base64")}`
);

const column = (name, comment = null) => ({ name, comment });
const table = (schema, name, comment, columns) => ({ schema, name, comment, columns });
const report = summarizeMissingComments([
  table("public", "orders", "", [column("id", "主键"), column("qty", "数量")]),
  table("finance", "orders", "订单", [column("id"), column("qty", " ")]),
  table("public", "users", "用户", [column("id", "主键")]),
  table("audit", "empty", null, []),
]);
assert.equal(report.scanned, 4);
assert.equal(report.tableMissingCount, 2);
assert.equal(report.columnMissingTableCount, 1);
assert.equal(report.columnMissingCount, 2);
assert.equal(report.entries.filter((entry) => matchesScanFilter(entry, "missing")).length, 3);
assert.equal(report.entries.filter((entry) => matchesScanFilter(entry, "table")).length, 2);
assert.equal(report.entries.filter((entry) => matchesScanFilter(entry, "column")).length, 1);
assert.notEqual(report.entries[0].key, report.entries[1].key, "跨 Schema 同名表不得合并");
assert.equal(summarizeMissingComments([]).scanned, 0);
assert.equal(summarizeMissingComments([table("public", "ready", "ok", [column("a", "ok")])]).columnMissingCount, 0);
console.log("PASS: 扫描仅统计真实 COMMENT、缺表/字段注释、跨 Schema 同名表、空与完整表、分类筛选");
