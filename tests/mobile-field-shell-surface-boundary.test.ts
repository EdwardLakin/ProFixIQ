import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const mobileShell = read("components/layout/MobileShell.tsx");
const mobileTiles = read("features/mobile/config/mobile-tiles.ts");
const mobileNav = read("components/layout/MobileBottomNav.tsx");

describe("Shop Mobile and Field shell separation", () => {
  it("persists Field chrome only for a server-verified standalone Field workspace", () => {
    expect(mobileShell).toContain(
      'fetch("/api/mobile/field-service/access"',
    );
    expect(mobileShell).toContain("body?.canAccessFieldService");
    expect(mobileShell).toContain("body?.standaloneFieldWorkspace");
    expect(mobileShell).toContain('FIELD_SURFACE_SESSION_KEY,\n              "standalone"');
    expect(mobileShell).toContain(
      'window.sessionStorage.getItem(FIELD_SURFACE_SESSION_KEY) ===\n            "standalone"',
    );
    expect(mobileShell).not.toContain(
      'window.sessionStorage.setItem(FIELD_SURFACE_SESSION_KEY, "true")',
    );
  });

  it("keeps Field-only tools out of Shop Mobile and gates the Field entry with verified access", () => {
    expect(mobileTiles).not.toContain('href: "/mobile/parts/truck"');
    expect(mobileTiles).not.toContain('href: "/mobile/service/followups"');
    expect(mobileTiles).toMatch(
      /href: "\/mobile\/service"[\s\S]*?roles: ALL_MOBILE_ROLES/,
    );
    expect(mobileNav).toContain(
      "!tile.href.startsWith(\"/mobile/service\") || canAccessFieldService",
    );
  });
});
