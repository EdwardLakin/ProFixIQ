import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260723010000_canonical_inspection_source.sql",
  "utf8",
);

describe("versioned canonical inspection writer migration", () => {
  it("installs a new RPC identity without unsafe line-level upserts", () => {
    expect(migration).toContain(
      "create or replace function public.save_inspection_progress_v3_atomic",
    );
    expect(migration).not.toContain("on conflict (work_order_line_id)");
    expect(migration).toContain("from public.inspections i");
    expect(migration).toContain("update public.inspections");
    expect(migration).toContain("and i.is_canonical");
    expect(migration).toContain("inspections_one_canonical_per_line_idx");
    const writer = migration.slice(
      migration.indexOf("create or replace function public.save_inspection_progress_v3_atomic"),
      migration.indexOf("create or replace function public.save_inspection_progress_v2_atomic"),
    );
    expect(writer).not.toContain("inspection_sessions");
  });

  it("preserves tenant authorization, revisions, and idempotency", () => {
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("and wol.shop_id = p_shop_id");
    expect(migration).toContain("p.user_id = p_actor_user_id");
    expect(migration).toContain("v_client_revision <> v_server_revision");
    expect(migration).toContain("mobile_operation_keys");
    expect(migration).toContain("session_fingerprint");
    expect(migration).toContain("sync_revision = v_next_revision");
    expect(migration).toContain(
      "revoke insert, update, delete on public.inspection_sessions",
    );
  });
});
