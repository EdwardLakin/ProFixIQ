import { describe, expect, it, vi, beforeEach } from "vitest";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

describe("dashboard readiness fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses an absolute app route URL with forwarded auth cookies", async () => {
    headersMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "host") return "profixiq.com";
        if (key === "x-forwarded-proto") return "https";
        if (key === "cookie") return "sb-access-token=abc";
        return null;
      },
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        rolloutStage: "http_verify_only",
        connector: {
          configured: true,
          canValidateShop: true,
          canWriteLive: false,
          liveMaterializationEnabled: false,
          mode: "unknown",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { getAgentReadinessForDashboard } = await import("@/features/onboarding-v2/lib/agentReadinessServer");
    const readiness = await getAgentReadinessForDashboard();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://profixiq.com/api/onboarding-v2/agent-readiness",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          cookie: "sb-access-token=abc",
          "x-forwarded-host": "profixiq.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(readiness.ok).toBe(true);
    expect(readiness.rolloutStage).toBe("http_verify_only");
    expect(readiness.connector.configured).toBe(true);
    expect(readiness.connector.canValidateShop).toBe(true);
    expect(readiness.connector.canWriteLive).toBe(false);
  });
});
