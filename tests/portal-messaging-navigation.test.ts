import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("portal work-order navigation and messaging", () => {
  it("returns from a portal work order to the portal dashboard", () => {
    const page = source("app/portal/work-orders/view/[id]/page.tsx");

    expect(page).toContain('backHref="/portal"');
    expect(page).not.toContain('backHref="/portal/history"');
  });

  it("treats customer profiles as customers and exposes advisor selection", () => {
    const authorization = source(
      "features/ai/lib/chat/authorization.ts",
    );
    const contextRoute = source("app/api/chat/context-options/route.ts");
    const startRoute = source("app/api/chat/start-conversation/route.ts");
    const workspace = source(
      "features/chat/components/PortalMessagesWorkspace.tsx",
    );

    expect(authorization).toContain('export type MessagingActor');
    expect(authorization).toContain('preferredKind === "customer"');
    expect(authorization).toContain('profileRole === "customer"');
    expect(authorization).toContain("isCustomerMessagingRole");
    expect(contextRoute).toContain("isCustomerMessagingRole(staff.role)");
    expect(contextRoute).toContain("recipients");
    expect(workspace).toContain('aria-label="Message recipient"');
    expect(workspace).toContain("normalizeMessageDraft");
    expect(workspace).toContain("ensureUuid(newThreadDraft?.conversationRequestId)");
    expect(workspace).toContain("setError(null)");
    expect(workspace).toContain(
      "/api/chat/my-conversations?actor=customer",
    );
    expect(workspace).toContain("actor_kind: \"customer\"");
    expect(workspace).toContain(
      "Assigned advisor or service team",
    );
    expect(workspace).toContain(
      "participant_ids: recipientUserId ? [recipientUserId] : []",
    );
    expect(startRoute).toContain(
      "requestedParticipantIds.length === 0",
    );
    expect(startRoute).toContain("isCustomerMessagingRole(profile.role)");
    expect(startRoute).toContain("deterministicUuidFromRequestId");
    expect(startRoute).toContain("normalized invalid request_id");
    expect(startRoute).not.toContain("request_id must be a UUID");
  });

  it("keeps portal request start server-owned after customer auth", () => {
    const startRoute = source("app/api/portal/request/start/route.ts");
    const submitRoute = source("app/api/portal/request/submit/route.ts");
    const migration = source(
      "supabase/migrations/20260725024500_restore_customer_portal_request_read_access.sql",
    );

    expect(startRoute).toContain("const userClient = createServerSupabaseRoute()");
    expect(startRoute).toContain("const actor = await requirePortalCustomerActor(userClient)");
    expect(startRoute).toContain("const admin = createAdminSupabase()");
    expect(startRoute).toContain("admin.rpc(");
    expect(startRoute).toContain("isPortalStartCompatibilityError");
    expect(startRoute).toContain("createPortalRequestDirect");
    expect(startRoute).toContain(
      'console.error("[portal/request/start] replay lookup failed"',
    );
    expect(startRoute).toContain("sourceRowId: null");
    expect(submitRoute).toContain("const admin = createAdminSupabase()");
    expect(migration).toContain("work_orders_customer_portal_select");
    expect(migration).toContain("profixiq_is_portal_customer_work_order");
  });
});
