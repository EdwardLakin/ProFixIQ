import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const mobileShell = read("components/layout/MobileShell.tsx");
const mobileTiles = read("features/mobile/config/mobile-tiles.ts");
const mobileNav = read("components/layout/MobileBottomNav.tsx");

describe("Shop Mobile and Field shell separation", () => {
  it("persists Field chrome only for a server-verified standalone Field workspace", () => {
    expect(mobileShell).toContain('fetch("/api/mobile/field-service/access"');
    expect(mobileShell).toContain("body?.canAccessFieldService");
    expect(mobileShell).toContain("body?.standaloneFieldWorkspace");
    expect(mobileShell).toContain("runBoundedRouteLoad");
    expect(mobileShell).toContain("readFieldServiceOfflineAccess");
    expect(mobileShell).toContain("readFieldSurfaceSession");
    expect(mobileShell).toContain("writeFieldSurfaceSession(verifiedScope)");
    expect(mobileShell).toContain("storedSurfaceScope?.userId === authUserId");
    expect(mobileShell).toContain("supabase.auth.onAuthStateChange");
    expect(mobileShell).toContain('window.addEventListener("online"');
    expect(mobileShell).toContain(
      'document.addEventListener("visibilitychange"',
    );
    expect(mobileShell).toContain(
      "preserveFieldSurfaceOnNextVerification.current = true",
    );
    expect(mobileShell).toContain("if (!preserveCurrentFieldSurface)");
    expect(mobileShell).toContain("fieldVerificationPending");
    expect(mobileShell).toContain('aria-busy="true"');
    expect(mobileShell).toContain("Verifying Field workspace...");
  });

  it("keeps Field-only tools out of Shop Mobile and gates the Field entry with verified access", () => {
    expect(mobileTiles).not.toContain('href: "/mobile/parts/truck"');
    expect(mobileTiles).not.toContain('href: "/mobile/service/followups"');
    expect(mobileTiles).toMatch(
      /href: "\/mobile\/service"[\s\S]*?roles: ALL_MOBILE_ROLES/,
    );
    expect(mobileNav).toContain("fieldAccess?.canConfigure");
    expect(mobileNav).toContain("verifiedSetupDestination");
    expect(mobileNav).toContain("fieldAccessResponse?.status === 403");
    expect(mobileNav).toContain('fieldAccess?.decision === "forbidden"');
    expect(mobileNav).toContain("fieldAccess?.productEntitled");
    expect(mobileNav).toContain('"/mobile/service/setup"');
    expect(mobileNav).toContain(
      'tile.href !== "/mobile/service" || fieldServiceHref',
    );
  });
});
