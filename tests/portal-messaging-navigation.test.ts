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

    expect(authorization).toContain('preferredKind === "customer"');
    expect(authorization).toContain('profileRole === "customer"');
    expect(contextRoute).toContain('.eq("role", "advisor")');
    expect(contextRoute).toContain("recipients");
    expect(workspace).toContain('aria-label="Message recipient"');
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
  });
});
