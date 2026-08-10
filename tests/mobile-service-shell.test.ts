import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/mobile/service/page.tsx");
const shell = read("features/mobile/service/MobileServiceShell.tsx");
const tiles = read("features/mobile/config/mobile-tiles.ts");
const activeRoute = read("app/api/mobile/service-visits/active/route.ts");
const dispatchRoute = read("app/api/dispatch/visits/[id]/route.ts");


describe("Mobile Service shell", () => {
  it("uses the merged Dispatch contracts instead of duplicating service-visit state", () => {
    expect(page).toContain("MobileServiceShell");
    expect(shell).toContain("/api/mobile/service-visits/active");
    expect(shell).toContain("/api/dispatch/visits/${visit.id}");
    expect(shell).not.toContain('from("service_visits")');
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
    expect(shell).toContain('transitionVisit(current, "dispatched")');
  });

  it("keeps dispatch mutations online-only but preserves a last-known field snapshot", () => {
    expect(shell).toContain("SNAPSHOT_CACHE_KEY");
    expect(shell).toContain("window.localStorage.setItem");
    expect(shell).toContain("window.localStorage.getItem");
    expect(shell).toContain("online && !stale");
    expect(shell).toContain("existing offline mobile workflow");
  });

  it("exposes Mobile Service through existing role navigation", () => {
    expect(tiles).toContain('href: "/mobile/service"');
    expect(tiles).toContain('title: "Mobile Service"');
    expect(tiles).toContain('"mechanic"');
    expect(tiles).toContain('"owner"');
  });
});
