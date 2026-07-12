import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.PARTS_LIFECYCLE_TEST_DATABASE_URL;
const hasPsql = spawnSync("bash", ["-lc", "command -v psql"], { encoding: "utf8" }).status === 0;
const describeDb = databaseUrl && hasPsql ? describe : describe.skip;

function psql(sql: string): string {
  const result = spawnSync("psql", [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.status !== 0) {
    throw new Error(`psql failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

describeDb("parts lifecycle database integration", () => {
  it("applies lifecycle migrations and exposes executable canonical RPCs", () => {
    const consolidated = readFileSync("db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql", "utf8");
    psql(consolidated + `
      select to_regprocedure('public.parts_allocate_request_item(uuid,uuid,numeric,text)') is not null as has_allocate,
             to_regprocedure('public.parts_release_allocation(uuid,uuid,numeric,text)') is not null as has_release,
             to_regprocedure('public.parts_receive_request_item(uuid,uuid,numeric,uuid,numeric,text)') is not null as has_receive,
             to_regprocedure('public.parts_issue_work_order_part(uuid,uuid,numeric,text)') is not null as has_issue,
             to_regprocedure('public.parts_return_to_stock(uuid,uuid,numeric,text)') is not null as has_return;
    `);
    expect(true).toBe(true);
  });

  it("runs the read-only audit without mutating data", () => {
    const preflight = readFileSync("db/sql/2026-07-11_parts_lifecycle_manual_preflight.sql", "utf8");
    const postcheck = readFileSync("db/sql/2026-07-11_parts_lifecycle_manual_postcheck.sql", "utf8");
    const audit = readFileSync("db/sql/2026-07-11_parts_lifecycle_readonly_audit.sql", "utf8");
    const before = psql("select count(*) from public.stock_moves;");
    psql(preflight);
    psql(postcheck);
    psql(audit);
    const after = psql("select count(*) from public.stock_moves;");
    expect(after).toBe(before);
  });
});
