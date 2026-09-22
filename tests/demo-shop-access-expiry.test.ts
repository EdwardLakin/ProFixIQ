import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseRSCMock = vi.hoisted(() => vi.fn());
const createServerSupabaseRouteMock = vi.hoisted(() => vi.fn());
const resolveCanonicalStaffProfileMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(),
  createServerSupabaseRSC: createServerSupabaseRSCMock,
  createServerSupabaseRoute: createServerSupabaseRouteMock,
}));

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: resolveCanonicalStaffProfileMock,
}));

import {
  getDemoShopId,
  isDemoAccessExpired,
} from "@/features/shared/lib/server/demo-shop";
import {
  requireShopPageAccess,
  requireShopScopedApiAccess,
} from "@/features/shared/lib/server/admin-access";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";

const DEMO_SHOP_ID_ENV = "DEMO_SHOP_ID";

describe("isDemoAccessExpired", () => {
  it("treats a null expiry as a normal, unaffected profile", () => {
    expect(isDemoAccessExpired(null)).toBe(false);
    expect(isDemoAccessExpired(undefined)).toBe(false);
  });

  it("allows a future expiry", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(isDemoAccessExpired(future)).toBe(false);
  });

  it("rejects a past expiry", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isDemoAccessExpired(past)).toBe(true);
  });

  it("fails closed on a malformed timestamp", () => {
    expect(isDemoAccessExpired("not-a-timestamp")).toBe(true);
  });
});

describe("getDemoShopId", () => {
  const originalValue = process.env[DEMO_SHOP_ID_ENV];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[DEMO_SHOP_ID_ENV];
    } else {
      process.env[DEMO_SHOP_ID_ENV] = originalValue;
    }
  });

  it("returns null when unset", () => {
    delete process.env[DEMO_SHOP_ID_ENV];
    expect(getDemoShopId()).toBeNull();
  });

  it("returns null for a blank value", () => {
    process.env[DEMO_SHOP_ID_ENV] = "   ";
    expect(getDemoShopId()).toBeNull();
  });

  it("returns the trimmed configured id", () => {
    process.env[DEMO_SHOP_ID_ENV] = `  ${SHOP_ID}  `;
    expect(getDemoShopId()).toBe(SHOP_ID);
  });
});

function mockAuthedUser() {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: AUTH_USER_ID } },
    error: null,
  });
  createServerSupabaseRSCMock.mockReturnValue({ auth: { getUser } });
  createServerSupabaseRouteMock.mockReturnValue({ auth: { getUser } });
}

function mockProfile(demoAccessExpiresAt: string | null) {
  resolveCanonicalStaffProfileMock.mockResolvedValue({
    profile: {
      id: PROFILE_ID,
      user_id: AUTH_USER_ID,
      shop_id: SHOP_ID,
      role: "owner",
      demo_access_expires_at: demoAccessExpiresAt,
    },
    error: null,
  });
}

describe("demo access expiry enforcement in admin-access gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthedUser();
  });

  describe("requireShopScopedApiAccess", () => {
    it("allows a normal (non-demo) profile", async () => {
      mockProfile(null);

      const result = await requireShopScopedApiAccess();

      expect(result.ok).toBe(true);
    });

    it("allows a demo profile with a future expiry", async () => {
      mockProfile(new Date(Date.now() + 60 * 60 * 1000).toISOString());

      const result = await requireShopScopedApiAccess();

      expect(result.ok).toBe(true);
    });

    it("rejects a demo profile with a past expiry, mid-request", async () => {
      mockProfile(new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const result = await requireShopScopedApiAccess();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(403);
      }
    });
  });

  describe("requireShopPageAccess", () => {
    it("allows a normal (non-demo) profile", async () => {
      mockProfile(null);

      const result = await requireShopPageAccess({});

      expect(result.profile.id).toBe(PROFILE_ID);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("allows a demo profile with a future expiry", async () => {
      mockProfile(new Date(Date.now() + 60 * 60 * 1000).toISOString());

      const result = await requireShopPageAccess({});

      expect(result.profile.id).toBe(PROFILE_ID);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("redirects a demo profile with a past expiry, mid-session", async () => {
      mockProfile(new Date(Date.now() - 60 * 60 * 1000).toISOString());

      await expect(requireShopPageAccess({})).rejects.toThrow(
        "redirect:/dashboard",
      );
    });
  });
});
