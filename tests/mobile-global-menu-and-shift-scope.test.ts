import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile global navigation", () => {
  it("keeps navigation, assistant, planner, install, and shift controls in the hamburger drawer", () => {
    const shell = read("components/layout/MobileShell.tsx");
    const menu = read("components/layout/MobileBottomNav.tsx");

    expect(shell).toContain('aria-label="Open navigation menu"');
    expect(shell).not.toContain("AskAssistantEntry");
    expect(shell).not.toContain("sticky bottom-0");

    expect(menu).toContain("getMobileTilesForRole(role, [\"all\"])");
    expect(menu).toContain("Ask Assistant");
    expect(menu).toContain("Open Planner");
    expect(menu).toContain("Install ProFixIQ");
    expect(menu).toContain("MobileShiftTracker");
  });

  it("moves install UI out of the global floating runtime status", () => {
    const source = read("features/shared/components/pwa/PwaRuntime.tsx");

    expect(source).toContain("profixiq:pwa-install-request");
    expect(source).toContain("profixiq:pwa-install-availability");
    expect(source).not.toContain(">\n              Install\n            </button>");
  });
});

describe("mobile shift online-first behavior", () => {
  it("calls the canonical server route while online before requiring offline scope", () => {
    const source = read("features/mobile/shifts/offline.ts");
    const onlineBranch = source.indexOf("if (navigator.onLine)");
    const missingScopeBranch = source.indexOf("if (!scope)", onlineBranch);

    expect(onlineBranch).toBeGreaterThan(-1);
    expect(missingScopeBranch).toBeGreaterThan(onlineBranch);
    expect(source.slice(onlineBranch, missingScopeBranch)).toContain(
      "postShiftAction(args.action, key)",
    );
    expect(source).not.toContain('throw new Error("Offline shop scope is unavailable.")');
  });
});
