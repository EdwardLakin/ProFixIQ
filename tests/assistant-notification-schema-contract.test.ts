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
    expect(migration).toContain("source = 'ops'");
    expect(migration).not.toContain(
      "create policy assistant_notifications_select_same_shop",
    );
    expect(migration).not.toMatch(
      /profixiq_current_role\(\)\) in \('owner', 'admin', 'manager'\)\s+or user_id/,
    );
  });

  it("stages recipient-bound rollout compatibility before final revocation", () => {
    expect(migration).toContain(
      "create policy assistant_notifications_insert_rollout_compat",
    );
    expect(migration).toContain(
      "create policy assistant_notifications_update_rollout_compat",
    );
    expect(migration).toContain("source in ('ops', 'ops_user')");
    expect(migration).toContain(
      "grant select, insert, update on table public.assistant_notifications",
    );
    expect(migration).not.toMatch(/grant (?:all|delete)[^;]*authenticated/);
    expect(migration).toContain("status = 'acknowledged'");
    expect(migration).toContain(
      "acknowledged_by = (select public.profixiq_workforce_profile_id())",
    );
  });

  it("recreates UUID-backed Parts writers with text entity predicates", () => {
    expect(migration).toContain(
      "parts_publish_request_notification_with_table(uuid,text)",
    );
    expect(migration).toContain(
      "parts_sync_technician_ready_notification_with_table(uuid)",
    );
    expect(migration).toContain(
      "parts_reconcile_pick_request_notification(uuid)",
    );
    expect(migration).toContain("entity_id = p_request_id::text");
    expect(migration).toContain("notification.entity_id = $2::text");
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
