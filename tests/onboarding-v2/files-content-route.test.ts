import { beforeEach, describe, expect, it, vi } from "vitest";

const withOnboardingAccessMock = vi.fn();
const proxyJsonMock = vi.fn();

vi.mock("@/features/onboarding-v2/server/apiProxy", () => ({
  withOnboardingAccess: withOnboardingAccessMock,
  proxyJson: proxyJsonMock,
}));

describe("files content route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withOnboardingAccessMock.mockResolvedValue({ ok: true, profile: { shop_id: "shop_123" } });
    proxyJsonMock.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));
  });

  it("forwards JSON upload body shape expected by the agent", async () => {
    const { POST } = await import("../../app/api/onboarding-v2/sessions/[sessionId]/files/content/route");

    const payload = {
      originalFilename: "legacy.csv",
      mimeType: "text/csv",
      contentBase64: Buffer.from("a,b\n1,2\n").toString("base64"),
    };

    const request = new Request("http://localhost/api/onboarding-v2/sessions/s_1/files/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    await POST(request, { params: Promise.resolve({ sessionId: "s_1" }) });

    expect(proxyJsonMock).toHaveBeenCalledTimes(1);
    expect(proxyJsonMock).toHaveBeenCalledWith({
      method: "POST",
      path: "/onboarding/sessions/s_1/files/content",
      shopId: "shop_123",
      body: payload,
    });
  });
});
