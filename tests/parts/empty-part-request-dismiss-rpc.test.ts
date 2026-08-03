import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260723210000_atomic_empty_part_request_dismiss.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("atomic empty parts request dismissal SQL", () => {
  it("owns the mutation inside one locked SECURITY DEFINER function", () => {
    expect(sql).toMatch(
      /create or replace function public\.parts_dismiss_empty_request_atomic/,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public/i);
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(
      /set status = 'cancelled'::public\.part_request_status/i,
    );
  });

  it("checks direct callers, tenant scope, roles, status, and all child items", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("PARTS_ACTOR_MISMATCH");
    expect(sql).toContain("profile.shop_id = p_shop_id");
    expect(sql).toContain("PARTS_ROLE_ACCESS_DENIED");
    expect(sql).toContain(
      "v_request.status::text not in ('requested', 'quoted', 'approved')",
    );
    expect(sql).toMatch(
      /from public\.part_request_items item\s+where item\.request_id = p_request_id/i,
    );
  });

  it("is idempotent and exposes no anonymous execution path", () => {
    expect(sql).toContain("'idempotent', true");
    expect(sql).toMatch(
      /revoke all on function public\.parts_dismiss_empty_request_atomic[\s\S]*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.parts_dismiss_empty_request_atomic[\s\S]*to authenticated, service_role/i,
    );
  });
});
