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
const dailySummarySource = readFileSync(
  "features/agent/server/getRoleDailySummary.ts",
  "utf8",
);
const suggestedActionsRoute = readFileSync(
  "app/api/assistant/suggested-actions/route.ts",
  "utf8",
);
const plannerDailySummaryRoute = readFileSync(
  "app/api/planner/daily-summary/route.ts",
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
    expect(migration).toContain("public.canonical_shop_membership_role(role)");
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
    expect(migration.match(/source = 'ops_user'/g)).toHaveLength(3);
    expect(
      migration.match(/profixiq_current_role\(\)\) = 'mechanic'/g),
    ).toHaveLength(3);
    expect(migration).toContain(
      "assistant_notification_trusted_writer_rollout_complete()",
    );
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain(
      "execute 'revoke insert, update on table public.assistant_notifications '",
    );
    expect(migration).toContain(
      "execute 'grant update (status, acknowledged_at, acknowledged_by, updated_at) '",
    );
    expect(migration).toContain(
      "grant select, insert, update on table public.assistant_notifications",
    );
    expect(migration).not.toMatch(/grant (?:all|delete)[^;]*authenticated/);
    expect(migration).toContain("status = 'acknowledged'");
    expect(migration).toContain(
      "acknowledged_by = (select public.profixiq_workforce_profile_id())",
    );
  });

  it("limits shared ops rows to explicit Shop workforce roles", () => {
    expect(migration).toContain(
      "'owner', 'admin', 'manager', 'advisor', 'service', 'parts',",
    );
    expect(migration).toContain("'lead_hand', 'foreman'");
    expect(migration.match(/source <> 'ops'/g)).toHaveLength(2);
    expect(migration).not.toMatch(
      /source = 'ops'\s+or public\.canonical_shop_membership_role/,
    );
  });

  it("records an immutable production deployment before closing compatibility", () => {
    expect(migration).toContain(
      "create table if not exists public.assistant_notification_rollout_markers",
    );
    expect(migration).toContain(
      "mark_assistant_notification_trusted_writer_rollout",
    );
    expect(syncSource).toContain(
      "markAssistantNotificationTrustedWriterRollout(notificationWriter)",
    );
    const terminalGuard = migration.indexOf(
      "Finalization is a terminal contract state",
    );
    const markerInsert = migration.indexOf(
      "insert into public.assistant_notification_rollout_markers",
    );
    expect(terminalGuard).toBeGreaterThan(-1);
    expect(terminalGuard).toBeLessThan(markerInsert);
    expect(migration).toContain("and finalized_at is not null");
    expect(migration).toContain("then\n    return;");
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
    expect(syncSource).toContain("if (!canAccessAssistantNotifications(role))");
    expect(syncSource).toContain("getAssistantNotificationWriter()");
    expect(syncSource).toContain('.eq("shop_id", shopId)');
    expect(syncSource).toContain('.eq("source", source)');
  });

  it("keeps Fleet-only daily summaries off the Shop notification writer", () => {
    expect(dailySummarySource).toContain(
      "canAccessAssistantNotifications(params.role)",
    );
    expect(dailySummarySource).toMatch(
      /canAccessAssistantNotifications\(params\.role\)[\s\S]*syncAssistantNotifications/,
    );
    expect(dailySummarySource).toContain(
      "canSyncNotifications\n    ? normalizeRole(params.role)\n    : canonicalizeRole(params.role)",
    );
  });

  it("rejects non-workforce callers before the privileged sync boundary", () => {
    expect(plannerRoute).toContain(
      "if (!canAccessAssistantNotifications(profile.role))",
    );
    expect(plannerRoute).toContain("{ status: 403 }");
  });

  it("persists the one-time rollout finalization state", () => {
    expect(migration).toContain("finalized_at timestamptz");
    expect(migration).toContain("and finalized_at is null");
    expect(migration).toContain("set finalized_at = now()");
    expect(migration).toContain("and finalized_at is not null");
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
    expect(plannerRoute).toContain(
      "assignmentUserIds: [profile.profileId, user.id]",
    );
    expect(syncSource).toContain("assignmentUserIds = userId ? [userId] : []");
    expect(syncSource).toContain("userIds: assignmentUserIds");
    expect(syncSource).toContain('.in("assigned_tech_id", userIds)');
    expect(syncSource).toContain('.in("assigned_to", userIds)');
    expect(syncSource).toContain('.in("technician_id", userIds)');
    expect(dailySummarySource).toContain(
      "userId: params.profileId ?? params.userId",
    );
    expect(dailySummarySource).toContain(
      "[params.userId, params.profileId].filter(",
    );
    expect(dailySummarySource).toContain(
      "assignmentUserIds: notificationUserIds",
    );
    expect(
      suggestedActionsRoute.match(/profileId: actor\.profileId/g),
    ).toHaveLength(2);
    expect(plannerDailySummaryRoute).toContain("user_id.eq.${userId}");
    expect(plannerDailySummaryRoute).toContain(
      "profileId: profile.profileId as string",
    );
    expect(plannerDailySummaryRoute).toContain(
      "profile.profileId === user.id ? supabase : createAdminSupabase()",
    );
    expect(plannerDailySummaryRoute).toContain("user_id: profile.profileId");
    expect(acknowledgementRoute).toContain(
      "acknowledged_by: profile.profileId",
    );
  });
});
