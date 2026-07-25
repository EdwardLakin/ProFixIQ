import { createHmac } from "node:crypto";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoPreviewPage from "../app/demo/preview/[demoId]/page";
import DemoReportPage from "../app/demo/report/[demoId]/page";
import {
  generateShopBoostPreviewToken,
  verifyShopBoostPreviewToken,
} from "@/features/integrations/shopBoost/shareAccess";

const loadShadowPreviewContext = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("TEST_NOT_FOUND");
  }),
);

vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/integrations/shopBoost/shadowShop", () => ({
  loadShadowPreviewContext,
}));

const SECRET =
  "shop-boost-preview-test-secret-with-more-than-thirty-two-bytes";
const DEMO_A = "11111111-1111-4111-8111-111111111111";
const DEMO_B = "22222222-2222-4222-8222-222222222222";
const INTAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INTAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeToken(overrides?: Partial<{ demoId: string; intakeId: string }>) {
  return generateShopBoostPreviewToken({
    demoId: overrides?.demoId ?? DEMO_A,
    intakeId: overrides?.intakeId ?? INTAKE_A,
  });
}

async function expectPreviewDenied(args: {
  demoId?: string;
  token?: string;
  intakeId?: string;
}) {
  await expect(
    DemoPreviewPage({
      params: Promise.resolve({ demoId: args.demoId ?? DEMO_A }),
      searchParams: Promise.resolve({
        token: args.token,
        intakeId: args.intakeId,
      } as never),
    }),
  ).rejects.toThrow("TEST_NOT_FOUND");
  expect(loadShadowPreviewContext).not.toHaveBeenCalled();
}

describe("Shop Boost preview access", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubEnv("SHOP_BOOST_SHARE_SECRET", SECRET);
    loadShadowPreviewContext.mockReset();
    notFound.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed without the dedicated secret and never falls back to the service key", () => {
    const token = makeToken();
    vi.stubEnv("SHOP_BOOST_SHARE_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET);

    expect(verifyShopBoostPreviewToken(token)).toBeNull();
    expect(() => makeToken()).toThrow("SHOP_BOOST_SHARE_SECRET");
  });

  it("rejects a correctly signed token for another purpose", () => {
    const token = makeToken();
    const [encodedPayload] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    payload.purpose = "shop_boost_share_email";
    const wrongPurposePayload = Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(wrongPurposePayload)
      .digest("base64url");

    expect(
      verifyShopBoostPreviewToken(`${wrongPurposePayload}.${signature}`),
    ).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-token"],
    ["empty", ""],
  ])("returns a generic 404 for a %s token before privileged loading", async (_label, token) => {
    await expectPreviewDenied({ token });
  });

  it("protects the adjacent report page before privileged loading", async () => {
    await expect(
      DemoReportPage({
        params: Promise.resolve({ demoId: DEMO_A }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("TEST_NOT_FOUND");
    expect(loadShadowPreviewContext).not.toHaveBeenCalled();
  });

  it("rejects a tampered token before privileged loading", async () => {
    const token = makeToken();
    const [payload, signature] = token.split(".");
    const replacement = signature.startsWith("A") ? "B" : "A";

    await expectPreviewDenied({
      token: `${payload}.${replacement}${signature.slice(1)}`,
    });
  });

  it("rejects an expired token before privileged loading", async () => {
    vi.useFakeTimers();
    const issuedAt = new Date("2026-07-25T12:00:00.000Z");
    vi.setSystemTime(issuedAt);
    const token = generateShopBoostPreviewToken({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
      expiresInDays: 1,
    });
    vi.setSystemTime(issuedAt.getTime() + 24 * 60 * 60 * 1000 + 1);

    await expectPreviewDenied({ token });
  });

  it("rejects a valid token used on another demo route before privileged loading", async () => {
    await expectPreviewDenied({ demoId: DEMO_B, token: makeToken() });
  });

  it("derives both privileged lookup identifiers only from the validated token", async () => {
    const token = makeToken();
    loadShadowPreviewContext.mockResolvedValue({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
      shopName: "Token Bound Auto",
      country: "US",
      snapshot: {},
    });

    const result = await DemoPreviewPage({
      params: Promise.resolve({ demoId: DEMO_A }),
      searchParams: Promise.resolve({ token, intakeId: INTAKE_B } as never),
    });

    expect(loadShadowPreviewContext).toHaveBeenCalledTimes(1);
    expect(loadShadowPreviewContext).toHaveBeenCalledWith({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
    });
    const props = result.props as { shareMeta: { token: string } };
    expect(props.shareMeta.token).toBe(token);
  });
});
