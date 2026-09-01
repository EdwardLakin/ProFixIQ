import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260901182000_finalize_assistant_notifications_authorization.sql",
  "utf8",
);

describe("assistant notification post-deploy authorization", () => {
  it("removes rollout writers and retains acknowledgement-only mutation", () => {
    expect(migration).toContain(
      "drop policy if exists assistant_notifications_insert_rollout_compat",
    );
    expect(migration).toContain(
      "drop policy if exists assistant_notifications_update_rollout_compat",
    );
    expect(migration).toContain(
      "revoke insert, update on table public.assistant_notifications",
    );
    expect(migration).toContain(
      "grant update (status, acknowledged_at, acknowledged_by, updated_at)",
    );
    expect(migration).not.toMatch(/grant (?:all|insert|delete)[^;]*authenticated/);
  });
});
