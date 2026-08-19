import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const route = read("app/mobile/service/jobs/page.tsx");
const cockpit = read("features/mobile/service/FieldActiveWork.tsx");
const hub = read("features/mobile/service/FieldHub.tsx");
const fieldShell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const serviceShell = read("features/mobile/service/MobileServiceShell.tsx");
const workOrderQueue = read(
  "features/mobile/work-orders/MobileWorkOrderQueue.tsx",
);

describe("Field active-work cockpit", () => {
  it("routes the Jobs in progress card into the dedicated Field execution surface", () => {
    expect(hub).toMatch(
      /id: "jobs_in_progress"[\s\S]*?href: "\/mobile\/service\/jobs"/,
    );
    expect(route).toContain("<FieldActiveWork />");
    expect(fieldShell).toContain('href="/mobile/service/jobs"');
    expect(fieldShell).toContain('return "Active field work"');
  });

  it("composes canonical service-visit and work-order readers without direct data writes", () => {
    expect(cockpit).toContain("<MobileServiceShell embedded />");
    expect(cockpit).toContain(
      '<MobileWorkOrderQueue initialStatus="in_progress" embedded lockStatus />',
    );
    expect(cockpit).not.toContain('.from("');
    expect(cockpit).not.toContain("supabase");
  });

  it("keeps the service lifecycle and repair queue valid when embedded in one page landmark", () => {
    expect(serviceShell).toMatch(/<div\r?\n\s+className=\{`\$\{/);
    expect(workOrderQueue).toContain(
      '<div className="mobile-work-order-queue">',
    );
    expect(workOrderQueue).toContain("lockStatus?: boolean");
    expect(workOrderQueue).toContain("!lockStatus ?");
  });

  it("keeps adjacent job tools on existing Field and mobile routes", () => {
    for (const href of [
      "/mobile/service/new",
      "/mobile/service/truck-inventory",
      "/mobile/inspections",
      "/mobile/work-orders",
    ]) {
      expect(cockpit).toContain(`href: "${href}"`);
    }
  });
});
