import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("acquisition auth handoff", () => {
  it("lets only a canonical unassigned shop owner continue to onboarding", () => {
    const route = read("app/api/auth/sign-in/route.ts");

    expect(route).toContain("if (!profile) return deny();");
    expect(route).toContain('if (surface === "shop" && !profile.role)');
    expect(route).toContain(
      'return NextResponse.json({ ok: true, destination: "/onboarding" });',
    );
    expect(route).not.toContain("if (!profile?.shop_id) return deny();");
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
    expect(forgotPassword).toContain(
      "/api/auth/send-reset?redirect=",
    );
  });

  it("does not promise a confirmation email for a repeated signup", () => {
    const signIn = read("features/auth/components/SignIn.tsx");

    expect(signIn).toContain(
      "If this is a new account, check its inbox for the verification link.",
    );
    expect(signIn).toContain(
      "If you already have an account, choose Sign in—another confirmation email will not be sent.",
    );
    expect(signIn).toContain('setPassword("");');
    expect(signIn).not.toContain(
      "Check your email to verify the account, then continue into shop setup.",
    );
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
