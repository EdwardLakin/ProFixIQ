import { describe, expect, it, vi, beforeEach } from "vitest";

const cookiesMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

describe("dashboard readiness fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the api route with auth cookies and maps verify-only readiness", async () => {
    cookiesMock.mockResolvedValue({ toString: () => "sb-access-token=abc" });
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
      "/api/onboarding-v2/agent-readiness",
      expect.objectContaining({ cache: "no-store", headers: { cookie: "sb-access-token=abc" } }),
    );
    expect(readiness.ok).toBe(true);
    expect(readiness.rolloutStage).toBe("http_verify_only");
    expect(readiness.connector.configured).toBe(true);
    expect(readiness.connector.canValidateShop).toBe(true);
    expect(readiness.connector.canWriteLive).toBe(false);
    expect(readiness.connector.liveMaterializationEnabled).toBe(false);
  });
});
