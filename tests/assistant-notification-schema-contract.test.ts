import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260901173500_reconcile_assistant_notifications_contract.sql",
  "utf8",
);
const syncSource = readFileSync(
  "features/agent/server/syncAssistantNotifications.ts",
  "utf8",
);
const plannerRoute = readFileSync(
  "app/api/planner/notifications/route.ts",
  "utf8",
);
const acknowledgementRoute = readFileSync(
  "app/api/planner/notifications/[id]/ack/route.ts",
  "utf8",
);

describe("assistant notification shared persistence contract", () => {
  it("creates the missing relation and keeps opaque entity identifiers", () => {
    expect(migration).toContain(
      "create table if not exists public.assistant_notifications",
    );
    expect(migration).toContain("entity_id text");
    expect(migration).toContain(
      "alter column entity_id type text using entity_id::text",
    );
  });

  it("restricts direct reads to the canonical recipient identity or role", () => {
    expect(migration).toContain(
      "create policy assistant_notifications_select_intended_recipient",
    );
    expect(migration).toContain("public.current_shop_id()");
    expect(migration).toContain("public.profixiq_workforce_profile_id()");
    expect(migration).toContain("public.profixiq_current_role()");
    expect(migration).toContain(
      "public.canonical_shop_membership_role(role)",
    );
    expect(migration).not.toContain(
      "create policy assistant_notifications_select_same_shop",
    );
    expect(migration).not.toMatch(
      /profixiq_current_role\(\)\) in \('owner', 'admin', 'manager'\)\s+or user_id/,
    );
  });

  it("allows browser acknowledgement columns but no direct notification creation", () => {
    expect(migration).toContain(
      "grant update (status, acknowledged_at, acknowledged_by, updated_at)",
    );
    expect(migration).not.toContain(
      "grant all on table public.assistant_notifications to authenticated",
    );
    expect(migration).not.toMatch(/grant insert[^;]*authenticated/);
    expect(migration).toContain("status = 'acknowledged'");
    expect(migration).toContain(
      "acknowledged_by = (select public.profixiq_workforce_profile_id())",
    );
  });

  it("keeps generation on a trusted writer and scopes resolution defensively", () => {
    expect(syncSource).toContain("getAssistantNotificationWriter()");
    expect(syncSource).toContain('.eq("shop_id", shopId)');
    expect(syncSource).toContain('.eq("source", source)');
  });

  it("replays the production consistency trigger", () => {
    expect(migration).toContain(
      "create or replace function public.enforce_assistant_notification_consistency()",
    );
    expect(migration).toContain(
      "create trigger trg_enforce_assistant_notification_consistency",
    );
  });

  it("resolves linked imported profiles for reads and acknowledgements", () => {
    for (const source of [plannerRoute, acknowledgementRoute]) {
      expect(source).toContain("user_id.eq.${userId}");
      expect(source).toContain(
        "data?.find((row) => row.id === userId) ?? data?.[0]",
      );
    }
    expect(plannerRoute).toContain("userId: profile.profileId");
    expect(acknowledgementRoute).toContain(
      "acknowledged_by: profile.profileId",
    );
  });
});
