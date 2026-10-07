import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/stripe/lib/server/early-access-checkout", () => ({
  createEarlyAccessCheckout: mocks.createCheckout,
}));
vi.mock("@/features/shared/lib/server/publicRouteRateLimit", () => ({
  enforcePublicRouteRateLimit: mocks.rateLimit,
}));

import { POST } from "../app/api/public/early-access/checkout/route";

const TOKEN = "t".repeat(43);

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/public/early-access/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("public Early Access checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rateLimit.mockReturnValue(null);
    mocks.createCheckout.mockResolvedValue({
      sessionId: "cs_test_1",
      url: "https://checkout.stripe.test/cs_test_1",
    });
  });

  it("creates a checkout for a valid token", async () => {
    const response = await POST(post(JSON.stringify({ token: TOKEN })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sessionId: "cs_test_1",
    });
    expect(mocks.createCheckout).toHaveBeenCalledWith(TOKEN);
  });

  it("returns the limiter response before reading the body or touching Stripe", async () => {
    mocks.rateLimit.mockReturnValue(new Response(null, { status: 429 }));

    const response = await POST(post(JSON.stringify({ token: TOKEN })));

    expect(response.status).toBe(429);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("rejects an oversized body without creating a checkout", async () => {
    const response = await POST(post(JSON.stringify({ token: "x".repeat(5000) })));

    expect(response.status).toBe(413);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and missing tokens", async () => {
    expect((await POST(post("{not json"))).status).toBe(400);
    expect((await POST(post("null"))).status).toBe(400);
    expect((await POST(post(JSON.stringify({ token: 42 })))).status).toBe(400);
    expect((await POST(post(JSON.stringify({ token: "   " })))).status).toBe(400);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("shows applicants only the safe approval messages", async () => {
    mocks.createCheckout.mockRejectedValue(new Error("Early Access approval has expired."));
    const expired = await POST(post(JSON.stringify({ token: TOKEN })));
    expect(expired.status).toBe(400);
    await expect(expired.json()).resolves.toEqual({
      error: "Early Access approval has expired.",
    });
  });

  it("tells applicants to request a renewed link when attempts are exhausted", async () => {
    mocks.createCheckout.mockRejectedValue(
      new Error(
        "Early Access checkout has too many abandoned attempts. Reissue the approval link and try again.",
      ),
    );

    const response = await POST(post(JSON.stringify({ token: TOKEN })));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/new private signup link/);
    expect(data.error).not.toMatch(/reissue/i);
  });

  it("never leaks internal error detail", async () => {
    mocks.createCheckout.mockRejectedValue(
      new Error("Failed to attach Early Access checkout: duplicate key value (secret_detail)"),
    );

    const response = await POST(post(JSON.stringify({ token: TOKEN })));
    const text = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(text).toContain("temporarily unavailable");
    expect(text).not.toContain("secret_detail");
  });
});
