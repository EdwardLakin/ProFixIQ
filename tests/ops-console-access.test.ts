import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isDefaultOpsOperatorEmail,
  normalizeOpsOperatorEmail,
} from "@/features/ops/lib/operatorAccess";
import { isOutsideDesktopAppShell } from "@/features/shared/lib/routes/shellBoundaries";

const read = (path: string) => readFileSync(path, "utf8");

const opsPage = read("app/ops/page.tsx");
const opsLayout = read("app/ops/layout.tsx");
const opsFeedbackPage = read("app/ops/feedback/page.tsx");
const feedbackConsole = read("features/feedback/components/FeedbackConsole.tsx");
const legacyOpsAgentPage = read("app/ops/agent-control/page.tsx");
const legacyAgentPage = read("app/agent/page.tsx");
const operatorBoundary = read("features/ops/server/operator-access.ts");
const signIn = read("features/auth/components/SignIn.tsx");
const protectedRoutes = [
  read("app/api/feedback/route.ts"),
  read("app/api/feedback/[id]/route.ts"),
];

describe("ops console access boundary", () => {
  it("normalizes and admits only the configured owner identity in the client gate", () => {
    expect(normalizeOpsOperatorEmail("  EdwardLakin35@GMAIL.COM ")).toBe(
      "edwardlakin35@gmail.com",
    );
    expect(isDefaultOpsOperatorEmail("EdwardLakin35@GMAIL.COM")).toBe(true);
    expect(isDefaultOpsOperatorEmail("edwardlakin35+ops@gmail.com")).toBe(
      false,
    );
    expect(isDefaultOpsOperatorEmail("developer@example.com")).toBe(false);
    expect(isDefaultOpsOperatorEmail(null)).toBe(false);
  });

  it("keeps the ops surface outside the tenant dashboard shell and routes retired agent pages to feedback", () => {
    expect(isOutsideDesktopAppShell("/ops")).toBe(true);
    expect(isOutsideDesktopAppShell("/ops/feedback")).toBe(true);
    expect(opsLayout).toContain("requireOpsOperatorPageAccess");
    expect(opsPage).toContain("getOpsDashboardFeedback");
    expect(opsFeedbackPage).toContain("FeedbackConsole");
    expect(feedbackConsole).toContain('fetch("/api/feedback")');
    expect(legacyOpsAgentPage).toContain('redirect("/ops/feedback")');
    expect(legacyAgentPage).toContain('redirect("/ops/feedback")');
  });

  it("authorizes feedback control APIs through the verified ops identity", () => {
    expect(operatorBoundary).toContain("normalizeOpsOperatorEmail(user.email)");
    expect(operatorBoundary).not.toContain("user.email ?? profile?.email");
    for (const route of protectedRoutes) {
      expect(route).toContain("requireOpsOperatorApiAccess");
    }
  });

  it("offers Google OAuth only for the ops redirect flow", () => {
    expect(signIn).toContain(
      'safeInternalRedirect(searchParams.get("redirect"), "") === "/ops"',
    );
    expect(signIn).toContain('provider: "google"');
    expect(signIn).toContain("redirectTo: emailRedirectTo");
  });
});
