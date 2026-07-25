import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as claimPreview } from "@/app/api/demo/shop-boost/claim/route";
import { POST as runAnalysis } from "@/app/api/demo/shop-boost/run/route";
import { POST as sharePreview } from "@/app/api/demo/shop-boost/share/route";
import {
  generateShopBoostPreviewToken,
  verifyShopBoostPreviewToken,
} from "@/features/integrations/shopBoost/shareAccess";

const createAdminSupabase = vi.hoisted(() => vi.fn());
const buildShadowShopSnapshot = vi.hoisted(() => vi.fn());
const loadShadowPreviewContext = vi.hoisted(() => vi.fn());
const setApiKey = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase,
}));
vi.mock("@/features/integrations/shopBoost/shadowShop", () => ({
  buildShadowShopSnapshot,
  loadShadowPreviewContext,
}));
vi.mock("@sendgrid/mail", () => ({
  default: { setApiKey, send: sendEmail },
}));

const SECRET =
  "shop-boost-preview-route-test-secret-with-more-than-thirty-two-bytes";
const DEMO_A = "11111111-1111-4111-8111-111111111111";
const DEMO_B = "22222222-2222-4222-8222-222222222222";
const INTAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INTAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function request(path: string, body: Record<string, unknown>): NextRequest {
  return new Request(`https://www.profixiq.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("Shop Boost preview route guards", () => {
  beforeEach(() => {
    vi.stubEnv("SHOP_BOOST_SHARE_SECRET", SECRET);
    vi.stubEnv("SENDGRID_API_KEY", "sendgrid-test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@profixiq.test");
    createAdminSupabase.mockReset();
    buildShadowShopSnapshot.mockReset();
    loadShadowPreviewContext.mockReset();
    setApiKey.mockReset();
    sendEmail.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects claim requests without a token before creating an admin client", async () => {
    const response = await claimPreview(
      request("/api/demo/shop-boost/claim", {
        demoId: DEMO_A,
        intakeId: INTAKE_A,
        email: "owner@example.com",
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it("fails the analysis before privileged access when the token secret is missing", async () => {
    vi.stubEnv("SHOP_BOOST_SHARE_SECRET", "");

    const response = await runAnalysis(
      request("/api/demo/shop-boost/run", {
        demoId: DEMO_A,
        intakeId: INTAKE_A,
        shopName: "Token Bound Auto",
        uploads: [
          {
            dataset: "customers",
            fileName: "customers.csv",
            sizeBytes: 10,
            contentType: "text/csv",
            path: `demos/${DEMO_A}/${INTAKE_A}/customers.csv`,
          },
        ],
      }),
    );

    expect(response.status).toBe(500);
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it("rejects share requests with a tampered token before any privileged read", async () => {
    const token = generateShopBoostPreviewToken({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    const response = await sharePreview(
      request("/api/demo/shop-boost/share", {
        previewToken: tampered,
        recipientEmail: "owner@example.com",
      }),
    );

    expect(response.status).toBe(404);
    expect(loadShadowPreviewContext).not.toHaveBeenCalled();
    expect(createAdminSupabase).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("uses only token-bound identifiers when claiming an analysis", async () => {
    const token = generateShopBoostPreviewToken({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
    });
    const leadLookup: Record<string, ReturnType<typeof vi.fn>> = {};
    leadLookup.select = vi.fn(() => leadLookup);
    leadLookup.eq = vi.fn(() => leadLookup);
    leadLookup.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

    const demoLookup: Record<string, ReturnType<typeof vi.fn>> = {};
    demoLookup.select = vi.fn(() => demoLookup);
    demoLookup.eq = vi.fn(() => demoLookup);
    demoLookup.maybeSingle = vi.fn(async () => ({
      data: { id: DEMO_A, snapshot: { intakeId: INTAKE_A } },
      error: null,
    }));

    const insert = vi.fn(async () => ({ error: null }));
    const updateQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    updateQuery.update = vi.fn(() => updateQuery);
    updateQuery.eq = vi.fn(async () => ({ error: null }));
    const from = vi
      .fn()
      .mockReturnValueOnce(leadLookup)
      .mockReturnValueOnce(demoLookup)
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce(updateQuery);
    createAdminSupabase.mockReturnValue({ from });

    const response = await claimPreview(
      request("/api/demo/shop-boost/claim", {
        previewToken: token,
        demoId: DEMO_B,
        intakeId: INTAKE_B,
        email: "OWNER@EXAMPLE.COM",
      }),
    );

    expect(response.status).toBe(200);
    expect(demoLookup.eq).toHaveBeenCalledWith("id", DEMO_A);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ demo_id: DEMO_A, email: "owner@example.com" }),
    );
    expect(updateQuery.eq).toHaveBeenCalledWith("id", DEMO_A);
  });

  it("uses only token-bound identifiers when issuing a new share link", async () => {
    const token = generateShopBoostPreviewToken({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
    });
    loadShadowPreviewContext.mockResolvedValue({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
      shopName: "Token Bound Auto",
      country: "US",
      snapshot: {},
    });

    const existingLeadQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    existingLeadQuery.select = vi.fn(() => existingLeadQuery);
    existingLeadQuery.eq = vi.fn(() => existingLeadQuery);
    existingLeadQuery.maybeSingle = vi.fn(async () => ({ data: null }));
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi
      .fn()
      .mockReturnValueOnce(existingLeadQuery)
      .mockReturnValueOnce({ insert });
    createAdminSupabase.mockReturnValue({ from });
    sendEmail.mockResolvedValue([{}]);

    const response = await sharePreview(
      request("/api/demo/shop-boost/share", {
        previewToken: token,
        demoId: DEMO_B,
        intakeId: INTAKE_B,
        recipientEmail: "owner@example.com",
        senderName: "Advisor",
      }),
    );
    const body = (await response.json()) as {
      ok: boolean;
      shareLink: string;
    };
    const shareUrl = new URL(body.shareLink);
    const sharedAccess = verifyShopBoostPreviewToken(
      shareUrl.searchParams.get("token") ?? "",
    );

    expect(response.status).toBe(200);
    expect(loadShadowPreviewContext).toHaveBeenCalledWith({
      demoId: DEMO_A,
      intakeId: INTAKE_A,
    });
    expect(sharedAccess?.demoId).toBe(DEMO_A);
    expect(sharedAccess?.intakeId).toBe(INTAKE_A);
    expect(sharedAccess?.senderName).toBe("Advisor");
    expect(shareUrl.searchParams.has("intakeId")).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
