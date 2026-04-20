import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OWNER_PIN_COOKIE_NAME,
  OWNER_PIN_PURPOSES,
  clearOwnerPinVerifiedCookie,
  createOwnerPinToken,
  requireOwnerPinVerified,
  verifyOwnerPinToken,
} from "../features/shared/lib/server/owner-pin";
import { NextResponse } from "next/server";

const SECRET_ENV = "OWNER_PIN_TOKEN_SECRET";

type MockSupabase = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from: () => {
    select: () => {
      eq: () => {
        single: () => Promise<{ data: { id: string } | null; error: unknown }>;
      };
    };
  };
};

function makeRequestWithCookie(cookie: string): Request {
  return new Request("http://localhost/api/test", {
    headers: {
      cookie,
    },
  });
}

function makeSupabase(userId = "user-1"): MockSupabase {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "shop-1" }, error: null }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  process.env[SECRET_ENV] = "unit-test-owner-pin-secret";
});

afterEach(() => {
  delete process.env[SECRET_ENV];
});

describe("owner pin signed token", () => {
  it("accepts a valid token", () => {
    const token = createOwnerPinToken({
      userId: "user-1",
      shopId: "shop-1",
      purpose: OWNER_PIN_PURPOSES.SETTINGS,
      ttlSeconds: 600,
    });

    const verified = verifyOwnerPinToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.sub).toBe("user-1");
      expect(verified.claims.shop_id).toBe("shop-1");
      expect(verified.claims.purpose).toBe(OWNER_PIN_PURPOSES.SETTINGS);
    }
  });

  it("rejects an expired token", async () => {
    const token = createOwnerPinToken({
      userId: "user-1",
      shopId: "shop-1",
      purpose: OWNER_PIN_PURPOSES.SETTINGS,
      ttlSeconds: -1,
    });

    const req = makeRequestWithCookie(`${OWNER_PIN_COOKIE_NAME}=${encodeURIComponent(token)}`);
    const result = await requireOwnerPinVerified(req, makeSupabase(), {
      userId: "user-1",
      shopId: "shop-1",
      allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects wrong user", async () => {
    const token = createOwnerPinToken({
      userId: "user-1",
      shopId: "shop-1",
      purpose: OWNER_PIN_PURPOSES.SETTINGS,
    });

    const req = makeRequestWithCookie(`${OWNER_PIN_COOKIE_NAME}=${encodeURIComponent(token)}`);
    const result = await requireOwnerPinVerified(req, makeSupabase("user-2"), {
      userId: "user-2",
      shopId: "shop-1",
      allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects wrong shop", async () => {
    const token = createOwnerPinToken({
      userId: "user-1",
      shopId: "shop-1",
      purpose: OWNER_PIN_PURPOSES.SETTINGS,
    });

    const req = makeRequestWithCookie(`${OWNER_PIN_COOKIE_NAME}=${encodeURIComponent(token)}`);
    const result = await requireOwnerPinVerified(req, makeSupabase(), {
      userId: "user-1",
      shopId: "shop-2",
      allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects wrong purpose", async () => {
    const token = createOwnerPinToken({
      userId: "user-1",
      shopId: "shop-1",
      purpose: OWNER_PIN_PURPOSES.BILLING,
    });

    const req = makeRequestWithCookie(`${OWNER_PIN_COOKIE_NAME}=${encodeURIComponent(token)}`);
    const result = await requireOwnerPinVerified(req, makeSupabase(), {
      userId: "user-1",
      shopId: "shop-1",
      allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("rejects after clear cookie", async () => {
    const res = NextResponse.json({ ok: true });
    clearOwnerPinVerifiedCookie(res);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${OWNER_PIN_COOKIE_NAME}=`);

    const req = makeRequestWithCookie("");
    const result = await requireOwnerPinVerified(req, makeSupabase(), {
      userId: "user-1",
      shopId: "shop-1",
      allowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});
