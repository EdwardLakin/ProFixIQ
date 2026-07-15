import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260715070000_phase6_atomic_inspection_progress.sql",
  "utf8",
);

describe("Phase 6 atomic inspection progress command", () => {
  it("uses a tenant-scoped operation key and one RPC transaction", () => {
    expect(sql).toContain("create table if not exists public.mobile_operation_keys");
    expect(sql).toContain("unique (shop_id, operation_name, operation_key)");
    expect(sql).toContain("save_inspection_progress_atomic");
    expect(sql).toContain("A stable operation key is required");
  });

  it("locks the source line and rejects cross-shop actors", () => {
    expect(sql).toContain("from public.work_order_lines wol");
    expect(sql).toContain("for update");
    expect(sql).toContain("Actor is not a member of this shop");
  });

  it("commits session and canonical inspection draft together", () => {
    expect(sql).toContain("insert into public.inspection_sessions");
    expect(sql).toContain("insert into public.inspections");
    expect(sql).toContain("on conflict (work_order_line_id) do update");
    expect(sql).toContain("Inspection is finalized and locked");
  });

  it("returns the prior result on identical retry", () => {
    expect(sql).toContain("return v_existing || jsonb_build_object('idempotent', true)");
    expect(sql).toContain("when unique_violation then");
  });
});
