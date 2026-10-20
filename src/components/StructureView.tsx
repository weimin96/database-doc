import type { TableInfo } from "../lib/types";
import { isMissing } from "../lib/types";
import { Badge } from "./ui/badge";
import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from "./ui/table";
export function StructureView({ table }: { table: TableInfo }) {
  return (
    <section className="structure-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{table.schema}</p>
          <h2>{table.name}</h2>
          <p className="table-comment">
            {table.comment?.trim() || "表注释缺失"}
          </p>
        </div>
        <Badge variant="secondary">{table.columns.length} 个字段</Badge>
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
                {isMissing(column.comment) ? (
                  <span className="text-muted-foreground">缺失</span>
                ) : (
                  column.comment
                )}
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
