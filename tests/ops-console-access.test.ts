import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isDefaultOpsOperatorEmail,
  normalizeOpsOperatorEmail,
} from "@/features/ops/lib/operatorAccess";
import { isOutsideDesktopAppShell } from "@/features/shared/lib/routes/shellBoundaries";

const read = (path: string) => readFileSync(path, "utf8");

const opsPage = read("app/ops/page.tsx");
const legacyAgentPage = read("app/agent/page.tsx");
const operatorBoundary = read("features/ops/server/operator-access.ts");
const signIn = read("features/auth/components/SignIn.tsx");
const protectedRoutes = [
  read("app/api/agent/requests/route.ts"),
  read("app/api/agent/requests/[id]/route.ts"),
  read("app/api/agent/requests/[id]/reply/route.ts"),
  read("app/api/agent/requests/[id]/notify-discord/route.ts"),
];

describe("ops console access boundary", () => {
  it("normalizes and admits only the configured owner identity in the client gate", () => {
    expect(normalizeOpsOperatorEmail("  EdwardLakin35@GMAIL.COM ")).toBe(
      "edwardlakin35@gmail.com",
    );
    expect(isDefaultOpsOperatorEmail("EdwardLakin35@GMAIL.COM")).toBe(true);
    expect(isDefaultOpsOperatorEmail("edwardlakin35+ops@gmail.com")).toBe(false);
    expect(isDefaultOpsOperatorEmail("developer@example.com")).toBe(false);
    expect(isDefaultOpsOperatorEmail(null)).toBe(false);
  });

  it("keeps the ops surface outside the tenant dashboard shell", () => {
    expect(isOutsideDesktopAppShell("/ops")).toBe(true);
    expect(isOutsideDesktopAppShell("/ops/cases")).toBe(true);
    expect(opsPage).toContain("requireOpsOperatorPageAccess");
    expect(legacyAgentPage).toContain('redirect("/ops")');
  });

  it("authorizes server access from the verified auth email", () => {
    expect(operatorBoundary).toContain(
      "normalizeOpsOperatorEmail(user.email)",
    );
    expect(operatorBoundary).not.toContain(
      "user.email ?? profile?.email",
    );
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
