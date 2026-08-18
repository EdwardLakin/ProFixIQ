import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const fieldShell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const fieldHub = read("features/mobile/service/FieldHub.tsx");
const fieldDispatchPage = read("app/mobile/service/dispatch/page.tsx");
const dispatchBoard = read("app/dashboard/dispatch/DispatchBoardClient.tsx");
const boardApi = read("app/api/dispatch/board/route.ts");
const visitApi = read("app/api/dispatch/visits/[id]/route.ts");
const intakeApi = read("app/api/mobile/service/intake/route.ts");

describe("Field service-call dispatch", () => {
  it("gives scheduling-capable Field operators a native Dispatch destination", () => {
    expect(fieldShell).toMatch(
      /label: "Dispatch"[\s\S]*?href: "\/mobile\/service\/dispatch"[\s\S]*?requiredCapability: "canManageScheduling"/,
    );
    expect(fieldHub).toMatch(
      /id: "dispatch_queue"[\s\S]*?href: "\/mobile\/service\/dispatch"[\s\S]*?requiredCapability: "canManageScheduling"/,
    );
    expect(fieldShell).toContain("<span>Dispatch</span>");
  });

  it("server-guards the Field dispatch page and reuses the canonical board", () => {
    expect(fieldDispatchPage).toContain("requireShopPageAccess");
    expect(fieldDispatchPage).toContain(
      'requiredCapability: "canManageScheduling"',
    );
    expect(fieldDispatchPage).toContain(
      '<DispatchBoardClient surface="field" />',
    );
    expect(dispatchBoard).toContain('fetch("/api/dispatch/board"');
    expect(dispatchBoard).toContain("/api/dispatch/visits/${visit.id}");
    expect(dispatchBoard).toContain('href="/mobile/service/new"');
    expect(dispatchBoard).toContain('"/mobile/appointments"');
  });

  it("keeps intake, assignment, and transitions on tenant-scoped commands", () => {
    expect(intakeApi).toContain("requireMobileServiceOperatorApiAccess");
    expect(intakeApi).toContain('"mobile_create_service_call_atomic"');
    expect(boardApi).toContain('requiredCapability: "canManageScheduling"');
    expect(boardApi).toContain("getDispatchBoard");
    expect(visitApi).toContain("assignServiceVisit");
    expect(visitApi).toContain("transitionServiceVisit");
    expect(visitApi).toContain("access.profile.shop_id");
  });

  it("does not repeat Truck inventory in the Field navigation", () => {
    expect(fieldShell.match(/label: "Truck inventory"/g)).toHaveLength(1);
  });
});
