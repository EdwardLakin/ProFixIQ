import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isSafeInternalRedirect,
  safeInternalRedirect,
} from "../features/auth/lib/safeRedirect";

const read = (path: string) => readFileSync(path, "utf8");

describe("authentication and portal hardening", () => {
  it("only accepts allowlisted internal redirect paths", () => {
    const allowed = ["/portal", "/auth/set-password"] as const;

    expect(safeInternalRedirect("/portal/fleet", "/portal", allowed)).toBe(
      "/portal/fleet",
    );
    expect(safeInternalRedirect("https://evil.example", "/portal", allowed)).toBe(
      "/portal",
    );
    expect(safeInternalRedirect("//evil.example", "/portal", allowed)).toBe(
      "/portal",
    );
    expect(safeInternalRedirect("/dashboard", "/portal", allowed)).toBe(
      "/portal",
    );
    expect(isSafeInternalRedirect("/portal?tab=quotes", allowed)).toBe(true);
    expect(isSafeInternalRedirect("/portal\\evil", allowed)).toBe(false);
  });

  it("keeps email identity resolution inside the server-owned sign-in exchange", () => {
    const signInRoute = read("app/api/auth/sign-in/route.ts");
    const retiredResolver = read("app/api/auth/resolve-login/route.ts");

    expect(signInRoute).toContain("resolveAuthEmail");
    expect(signInRoute).toContain("signInWithPassword");
    expect(signInRoute).toContain("GENERIC_ERROR");
    expect(signInRoute).toContain("enforceAuthRateLimit");
    expect(retiredResolver).toContain("status: 410");
    expect(retiredResolver).not.toContain("authEmail");
  });

  it("requires durable accepted invite evidence for customer access", () => {
    const portalAuth = read("features/portal/server/portalAuth.ts");
    const signInRoute = read("app/api/auth/sign-in/route.ts");
    const migration = read(
      "supabase/migrations/20260716130000_auth_invite_and_enrollment_hardening.sql",
    );

    for (const source of [portalAuth, signInRoute]) {
      expect(source).toContain("accepted_by_user_id");
      expect(source).toContain("accepted_at");
      expect(source).toContain("revoked_at");
    }
    expect(migration).toContain("Preserve portal access");
    expect(migration).toContain("from anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("uses opaque campaigns for public QR enrollment and hashed tokens for fleet invites", () => {
    const joinRoute = read("app/api/portal/qr/setup/route.ts");
    const campaignRoute = read("app/api/portal/qr/campaign/route.ts");
    const fleetInviteRoute = read("app/api/portal/fleet/invites/route.ts");
    const middleware = read("middleware.ts");

    expect(joinRoute).toContain("enforceAuthRateLimit");
    expect(joinRoute).toContain("campaignSlug");
    expect(campaignRoute).toContain("randomBytes");
    expect(fleetInviteRoute).toContain('createHash("sha256")');
    expect(fleetInviteRoute).toContain("token_hash");
    expect(middleware).toContain("isPortalActivationPage");
    expect(middleware).toContain("access.customer");
    expect(middleware).toContain("access.fleet");
    expect(middleware).toContain("profixiq_portal_only");
    expect(middleware).toContain("canUseMobile");
  });

  it("keeps mobile as a separate premium surface with shared server validation", () => {
    const mobile = read("app/mobile/sign-in/page.tsx");
    const main = read("features/auth/components/SignIn.tsx");
    const signup = read("app/signup/page.tsx");
    const shell = read("features/auth/components/AuthShell.tsx");

    expect(mobile).toContain('surface: "mobile"');
    expect(main).toContain('surface: "shop"');
    expect(mobile).toContain("AuthShell");
    expect(main).toContain("AuthShell");
    expect(signup).toContain('initialMode="sign-up"');
    expect(shell).toContain("ThemeToggle");
  });

  it("allows every known non-customer shop role to stay on mobile", () => {
    const signInRoute = read("app/api/auth/sign-in/route.ts");
    const middleware = read("middleware.ts");
    const mobileHome = read("app/mobile/page.tsx");
    const tiles = read("features/mobile/config/mobile-tiles.ts");

    for (const source of [signInRoute, middleware]) {
      expect(source).toContain("capabilities.isKnownRole");
      expect(source).toContain('capabilities.canonicalRole !== "customer"');
    }
    expect(signInRoute).toContain(
      '"/auth/set-password?redirect=%2Fmobile"',
    );
    expect(middleware).toContain('pathname !== "/mobile"');
    expect(middleware).not.toContain('completed ? "/dashboard" : "/onboarding"');
    expect(mobileHome).toContain(
      'role === "advisor" || role === "service"',
    );
    expect(tiles).toContain('| "service"');
  });
});
