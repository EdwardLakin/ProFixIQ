import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  activatePasswordProfile,
  PASSWORD_ACTIVATION_RETRY_MESSAGE,
} from "@/features/auth/lib/passwordActivation";

const pagePath = "app/auth/set-password/page.tsx";
const helperPath = "features/auth/lib/passwordActivation.ts";

describe("set-password shell transition", () => {
  it("performs a document navigation so the protected app shell is rebuilt", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("window.location.replace(redirect)");
    expect(source).not.toContain("router.replace(redirect)");
    expect(source).not.toContain("router.push(redirect)");
  });

  it("treats credential success and profile activation as separate stages", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("passwordCommitted");
    expect(source).toContain("activatePasswordProfile");
    expect(source).toContain("Retry account activation");
    expect(source).toContain('setPassword("")');
    expect(source).toContain('setConfirmPassword("")');
  });

  it("keeps database details internal and presents a safe retry message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: "Account activation could not be completed.",
      }),
    });
    const result = await activatePasswordProfile(fetchMock as never);

    expect(result).toEqual({
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail: "Account activation could not be completed.",
    });
    expect(PASSWORD_ACTIVATION_RETRY_MESSAGE).not.toContain("postgres");
    expect(readFileSync(helperPath, "utf8")).toContain(
      "/api/auth/password-activation",
    );
    expect(readFileSync(helperPath, "utf8")).toContain(
      "PASSWORD_ACTIVATION_RETRY_MESSAGE",
    );
  });
});
