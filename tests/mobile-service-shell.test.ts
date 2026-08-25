import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/mobile/service/page.tsx");
const shell = read("features/mobile/service/MobileServiceShell.tsx");
const scopeGate = read("features/mobile/service/MobileServiceScopeGate.tsx");
const routeGate = read(
  "features/mobile/service/MobileFieldServiceRouteGate.tsx",
);
const fieldHub = read("features/mobile/service/FieldHub.tsx");
const fieldAccessRoute = read("app/api/mobile/field-service/access/route.ts");
const tiles = read("features/mobile/config/mobile-tiles.ts");
const activeRoute = read("app/api/mobile/service-visits/active/route.ts");
const dispatchRoute = read("app/api/dispatch/visits/[id]/route.ts");

describe("Mobile Service shell", () => {
  it("uses the merged Dispatch contracts instead of duplicating service-visit state", () => {
    expect(page).toContain("MobileServiceScopeGate");
    expect(scopeGate).toContain("FieldHub");
    expect(fieldHub).toMatch(
      /<MobileServiceShell[\s\S]*?scope=\{scope\}[\s\S]*?\/>/,
    );
    expect(shell).toContain("/api/mobile/service-visits/active");
    expect(shell).toContain("/api/dispatch/visits/${visit.id}");
    expect(shell).not.toContain('.from("service_visits")');
    expect(activeRoute).toContain("getMobileActiveJobs");
    expect(dispatchRoute).toContain("transitionServiceVisit");
  });

  it("keeps repair execution in the existing mobile work-order surface", () => {
    expect(shell).toContain("/mobile/work-orders/${visit.workOrderId}");
    expect(shell).toContain('href="/mobile/work-orders/create"');
    expect(shell).not.toContain("work_order_lines");
  });

  it("provides the one-touch field lifecycle without replacing the canonical state machine", () => {
    expect(shell).toContain('label: "Start travel"');
    expect(shell).toContain('toStatus: "en_route"');
    expect(shell).toContain('label: "I\'ve arrived"');
    expect(shell).toContain('toStatus: "arrived"');
    expect(shell).toContain('label: "Start work"');
    expect(shell).toContain('toStatus: "working"');
    expect(shell).toContain('label: "Complete visit"');
    expect(shell).toContain('toStatus: "completed"');
    expect(shell).toContain('runTransition(visit, "paused")');
    expect(shell).toMatch(
      /transitionVisit\(\s*boundScope,\s*current,\s*"dispatched"/,
    );
    expect(shell).toContain('href="/mobile/service/dispatch"');
    expect(shell).toContain("canManageScheduling ?");
  });

  it("keeps dispatch mutations online-only but preserves an authenticated actor-scoped snapshot", () => {
    expect(shell).toContain("writeFieldActiveSnapshot(scope, snapshot)");
    expect(shell).toContain("readFieldActiveSnapshot(boundScope)");
    expect(shell).not.toContain("getOfflineMutationScope");
    expect(shell).not.toContain('getItem("profixiq:mobile-service:active:v1")');
    expect(shell).toContain("online && !stale");
    expect(shell).toContain("existing offline mobile workflow");
    expect(scopeGate).toContain("getOfflineMutationScope");
    expect(scopeGate).toContain("supabase.auth.getSession");
    expect(scopeGate).toContain("setOfflineMutationScope");
    expect(scopeGate).toContain("persistedScope?.userId === authUserId");
    expect(scopeGate).toContain(
      "persistedUserId && persistedUserId !== nextUserId",
    );
    expect(scopeGate).toContain("SNAPSHOT_SCOPE_KEY");
    expect(scopeGate).toContain("readFieldServiceOfflineAccess");
    expect(scopeGate).toContain("verificationUnavailable");
    expect(routeGate).toContain("readFieldServiceOfflineAccess");
    expect(routeGate).toContain("response.status >= 500");
    expect(routeGate).toContain("isRetryableOfflineStatus(response.status)");
    expect(scopeGate).toContain(
      "isRetryableOfflineStatus(fieldAccessResponse.status)",
    );
    expect(scopeGate).toContain("Snapshot persistence is best-effort");
    expect(fieldAccessRoute).toContain("userId: access.authUserId");
    expect(fieldAccessRoute).toContain("shopId: access.profile.shop_id");
    expect(scopeGate).not.toContain("resolveCurrentActor");
    expect(scopeGate).toContain('router.replace("/mobile")');
  });

  it("exposes Field Service only to roles eligible for personal field assignment", () => {
    expect(tiles).toContain('href: "/mobile/service"');
    expect(tiles).toContain('title: "Field Service"');
    expect(tiles).toContain('roles: ["mechanic", "lead_hand", "foreman"]');
  });
});
