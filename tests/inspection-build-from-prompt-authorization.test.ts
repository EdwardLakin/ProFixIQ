import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  createResponse: vi.fn(),
  getOpenAIClient: vi.fn(),
  getOpenAIModelForPurpose: vi.fn(),
  requireCanonicalShopOrFieldApiAccess: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  requireCanonicalShopOrFieldApiAccess:
    mocks.requireCanonicalShopOrFieldApiAccess,
}));

vi.mock("@/features/shared/lib/server/openai", () => ({
  getOpenAIClient: mocks.getOpenAIClient,
}));

vi.mock("@/features/shared/lib/server/openai-models", () => ({
  getOpenAIModelForPurpose: mocks.getOpenAIModelForPurpose,
}));

import { POST } from "../app/api/inspections/build-from-prompt/route";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

function promptRequest(body: unknown = { prompt: "20 point car inspection" }) {
  return new Request("http://localhost/api/inspections/build-from-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deniedAccess(status: 401 | 403) {
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: status === 401 ? "Not authenticated" : "Forbidden" },
      { status },
    ),
  };
}

function allowedAccess() {
  return {
    ok: true as const,
    authUserId: "00000000-0000-4000-8000-000000000001",
    canonicalRole: "owner",
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      role: "owner",
      shop_id: "00000000-0000-4000-8000-000000000002",
    },
    supabase: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCanonicalShopOrFieldApiAccess.mockResolvedValue(allowedAccess());
  mocks.getOpenAIClient.mockReturnValue({
    responses: { create: mocks.createResponse },
  });
  mocks.getOpenAIModelForPurpose.mockReturnValue("test-model");
  mocks.createResponse.mockResolvedValue({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_json",
            output_json: {
              sections: [
                {
                  title: "General",
                  items: Array.from({ length: 10 }, (_, index) => ({
                    item: `Generated item ${index + 1}`,
                    unit: null,
                  })),
                },
                {
                  title: "Lighting",
                  items: [{ item: "Headlamps", unit: null }],
                },
                {
                  title: "Tires",
                  items: [{ item: "Tread depth", unit: "mm" }],
                },
              ],
            },
          },
        ],
      },
    ],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inspection prompt-builder authorization", () => {
  it.each([401, 403] as const)(
    "returns %s before selecting or invoking an AI provider",
    async (status) => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mocks.requireCanonicalShopOrFieldApiAccess.mockResolvedValueOnce(
        deniedAccess(status),
      );

      const response = await POST(promptRequest());

      expect(response.status).toBe(status);
      expect(mocks.requireCanonicalShopOrFieldApiAccess).toHaveBeenCalledWith({
        allowRoles: ROLE_GROUPS.billingOperators,
      });
      expect(mocks.getOpenAIModelForPurpose).not.toHaveBeenCalled();
      expect(mocks.getOpenAIClient).not.toHaveBeenCalled();
      expect(mocks.createResponse).not.toHaveBeenCalled();
    },
  );

  it("keeps deterministic generation available to an authorized shop manager", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(promptRequest());
    const body = (await response.json()) as {
      sections: unknown[];
      metadata: { source: string };
    };

    expect(response.status).toBe(200);
    expect(body.sections.length).toBeGreaterThan(0);
    expect(body.metadata.source).toBe("base");
    expect(mocks.getOpenAIClient).not.toHaveBeenCalled();
  });

  it("allows provider augmentation only after the canonical gate succeeds", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const response = await POST(promptRequest());

    expect(response.status).toBe(200);
    expect(mocks.requireCanonicalShopOrFieldApiAccess).toHaveBeenCalledTimes(1);
    expect(mocks.getOpenAIClient).toHaveBeenCalledTimes(1);
    expect(mocks.createResponse).toHaveBeenCalledTimes(1);
  });
});

describe("inspection prompt-builder callers", () => {
  it("keeps the single shared caller behind both Shop and Field management gates", () => {
    const caller = readFileSync(
      "features/inspections/app/inspection/custom-inspection/page.tsx",
      "utf8",
    );
    const shopWrapper = readFileSync(
      "app/inspections/custom-inspection/page.tsx",
      "utf8",
    );
    const fieldLayout = readFileSync(
      "app/mobile/service/inspection-builder/layout.tsx",
      "utf8",
    );

    expect(caller).toContain('fetch("/api/inspections/build-from-prompt",');
    expect(shopWrapper).toContain("requireShopPageAccess");
    expect(shopWrapper).toContain("allowRoles: ROLE_GROUPS.billingOperators");
    expect(fieldLayout).toContain("requireMobileServiceOperatorApiAccess()");
    expect(fieldLayout).toContain("if (!access.managementRole)");
  });
});
