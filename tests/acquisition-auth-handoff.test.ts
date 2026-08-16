import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("acquisition auth handoff", () => {
  it("lets only a canonical unassigned shop owner continue to onboarding", () => {
    const route = read("app/api/auth/sign-in/route.ts");

    expect(route).toContain("if (profileError || !profile) return deny();");
    expect(route).toContain('if (surface === "shop" && !profile.role)');
    expect(route).toContain(
      'return NextResponse.json({ ok: true, destination: "/onboarding" });',
    );
    expect(route).not.toContain("if (!profile?.shop_id) return deny();");
  });

  it("upgrades a portal identity only through the acquisition claim path", () => {
    const route = read("app/api/auth/sign-in/route.ts");
    const signIn = read("features/auth/components/SignIn.tsx");
    const signInClient = read("features/auth/lib/signInClient.ts");
    const linkUser = read(
      "features/stripe/api/stripe/checkout/link-user/route.ts",
    );

    expect(route).toContain("acquisitionSessionId?: string");
    expect(route).toContain(
      'surface === "shop" && /^cs_[A-Za-z0-9_]+$/.test(acquisitionSessionId)',
    );
    expect(route).toContain("!hasAcquisitionContext");
    expect(signIn).toContain(
      'searchParams.get("flow")?.trim() === "acquisition"',
    );
    expect(signIn).toContain("acquisitionSessionId,");
    expect(signInClient).toContain("acquisitionSessionId?: string");
    expect(linkUser).toContain("admin.auth.admin.updateUserById");
    expect(linkUser).toContain("profixiq_portal_only: false");
    expect(linkUser.indexOf("if (!claim.claimed)")).toBeLessThan(
      linkUser.indexOf("profixiq_portal_only: false"),
    );
  });

  it("preserves acquisition context through forgot-password and recovery", () => {
    const signIn = read("features/auth/components/SignIn.tsx");
    const forgotPassword = read("app/forgot-password/page.tsx");

    for (const key of [
      "session_id",
      "flow",
      "demoId",
      "intakeId",
      "activationContext",
    ]) {
      expect(signIn).toContain(`searchParams.get("${key}")`);
      expect(forgotPassword).toContain(`"${key}"`);
    }

    expect(signIn).toContain("forgotPasswordHref");
    expect(signIn).toContain("href={forgotPasswordHref}");
    expect(forgotPassword).toContain('sp.get("email")');
    expect(forgotPassword).toContain("buildContinuationParams(sp, trimmed)");
    expect(forgotPassword).toContain("setPasswordRedirect");
    expect(forgotPassword).toContain("/api/auth/send-reset?redirect=");
  });

  it("binds account setup to the completed checkout email", () => {
    const signIn = read("features/auth/components/SignIn.tsx");
    const contextRoute = read(
      "features/stripe/api/stripe/checkout/acquisition-context/route.ts",
    );

    expect(signIn).toContain('isAcquisitionFlow ? "sign-up" : initialMode');
    expect(signIn).toContain(
      "/api/stripe/checkout/acquisition-context?session_id=",
    );
    expect(signIn).toContain("setIdentifier(email)");
    expect(signIn).toContain('acquisitionContextStatus === "ready"');
    expect(contextRoute).toContain("readStripeAcquisitionMetadata");
    expect(contextRoute).toContain("isCompletedStripeAcquisitionSession");
    expect(contextRoute).toContain("isStripeSubscriptionAccessBearing");
    expect(contextRoute).toContain('"Cache-Control": "no-store"');
  });

  it("lets an unconfirmed owner resend the verification email", () => {
    const signIn = read("features/auth/components/SignIn.tsx");

    expect(signIn).toContain("setPendingConfirmationEmail(email)");
    expect(signIn).toContain("supabase.auth.resend({");
    expect(signIn).toContain('type: "signup"');
    expect(signIn).toContain("options: { emailRedirectTo }");
    expect(signIn).toContain("Resend verification email");
  });

  it("claims a completed acquisition before leaving password recovery", () => {
    const setPassword = read("app/auth/set-password/page.tsx");

    expect(setPassword).toContain("claimStripeAcquisitionAfterAuth");
    expect(setPassword).toContain("if (!claim.linked)");
    expect(setPassword).toContain("resolvePostAuthDestination");
    expect(setPassword).toContain(
      'defaultDashboardHref: claim.required ? "/onboarding" : getReturnPath(role)',
    );
    expect(setPassword).toContain("window.location.replace(redirect)");
  });
});
