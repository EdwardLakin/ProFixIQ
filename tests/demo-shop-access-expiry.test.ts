import { readFileSync, readdirSync } from "node:fs";
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

    it("redirects a demo profile with a past expiry, mid-session, through sign-out", async () => {
      // Not directly to /sign-in: the Supabase session is still valid, and
      // middleware bounces an authenticated user who picks a product's
      // sign-in page straight back to /dashboard, recreating the loop.
      // Routing through the existing sign-out handler first actually clears
      // the session before the user lands anywhere.
      mockProfile(new Date(Date.now() - 60 * 60 * 1000).toISOString());

      await expect(requireShopPageAccess({})).rejects.toThrow(
        "redirect:/auth/signout",
      );
    });

    it("ignores a custom redirectTo for an expired demo profile", async () => {
      // /auth/signout is used unconditionally for expiry, never
      // options.redirectTo: a caller-supplied destination could itself be a
      // gated page that bounces the user straight back here, recreating the
      // loop this exists to avoid.
      mockProfile(new Date(Date.now() - 60 * 60 * 1000).toISOString());

      await expect(
        requireShopPageAccess({ redirectTo: "/dashboard/performance" }),
      ).rejects.toThrow("redirect:/auth/signout");
    });

    it("still redirects a non-expired, disallowed-role profile to the normal default destination", async () => {
      // Regression guard: the expiry fix must not change ordinary
      // authorization behavior for non-expiry denials.
      mockProfile(null);

      await expect(
        requireShopPageAccess({ allowRoles: ["admin"] }),
      ).rejects.toThrow("redirect:/dashboard");
    });

    it("still honors a custom redirectTo for a non-expiry denial", async () => {
      mockProfile(null);

      await expect(
        requireShopPageAccess({
          allowRoles: ["admin"],
          redirectTo: "/dashboard/performance",
        }),
      ).rejects.toThrow("redirect:/dashboard/performance");
    });
  });
});

function extractFunctionBody(sql: string, functionSignature: string): string {
  const start = sql.indexOf(functionSignature);
  if (start === -1) {
    throw new Error(`Function signature not found: ${functionSignature}`);
  }
  const nextFunctionIndex = sql.indexOf(
    "CREATE OR REPLACE FUNCTION",
    start + functionSignature.length,
  );
  return nextFunctionIndex === -1
    ? sql.slice(start)
    : sql.slice(start, nextFunctionIndex);
}

const migrationFileName = readdirSync("supabase/migrations").find((name) =>
  name.endsWith("_demo_shop_access_expiry.sql"),
);
if (!migrationFileName) {
  throw new Error("demo_shop_access_expiry migration not found");
}
const migration = readFileSync(
  `supabase/migrations/${migrationFileName}`,
  "utf8",
);
const delegationMigration = readFileSync(
  "supabase/migrations/20260725190200_p0_008_reconcile_runtime_behavior.sql",
  "utf8",
);

const isShopMemberBody = extractFunctionBody(
  migration,
  'CREATE OR REPLACE FUNCTION "public"."is_shop_member"',
);
const shopRoleBody = extractFunctionBody(
  migration,
  "CREATE OR REPLACE FUNCTION public.shop_role(shop_id uuid)",
);
const isStaffForShopBody = extractFunctionBody(
  migration,
  'CREATE OR REPLACE FUNCTION "public"."is_staff_for_shop"',
);

describe("demo access expiry — SQL contract", () => {
  it("adds the nullable expiry column on the canonical profiles table only", () => {
    expect(migration).toContain(
      "ALTER TABLE public.profiles\n  ADD COLUMN IF NOT EXISTS demo_access_expires_at timestamptz;",
    );
    expect(migration).not.toMatch(/shop_users/i);
  });

  describe("is_shop_member()", () => {
    it("keeps its existing profiles membership check and adds only the expiry condition", () => {
      expect(isShopMemberBody).toContain("pr.user_id = auth.uid()");
      expect(isShopMemberBody).toContain("pr.shop_id = p_shop");
      expect(isShopMemberBody).toContain(
        "AND (pr.demo_access_expires_at IS NULL OR pr.demo_access_expires_at > now())",
      );
    });

    it("preserves its function/security/search-path characteristics", () => {
      expect(isShopMemberBody).toContain('LANGUAGE "sql" STABLE');
      expect(isShopMemberBody).not.toContain("SECURITY DEFINER");
      expect(isShopMemberBody).toContain(
        "SET search_path TO 'public, extensions, pg_temp'",
      );
    });
  });

  describe("shop_role()", () => {
    it("keeps reading shop_members for role and adds only an expiry join back to profiles", () => {
      expect(shopRoleBody).toContain("select sm.role");
      expect(shopRoleBody).toContain("from public.shop_members sm");
      expect(shopRoleBody).toContain("join public.profiles pr");
      expect(shopRoleBody).toContain(
        "and (pr.demo_access_expires_at is null or pr.demo_access_expires_at > now())",
      );
    });

    it("preserves its function/security/search-path characteristics", () => {
      expect(shopRoleBody).toContain("STABLE SECURITY DEFINER");
      expect(shopRoleBody).toContain("SET search_path TO 'public', 'pg_temp'");
    });
  });

  describe("is_staff_for_shop()", () => {
    it("preserves its existing role allowlist and id-based membership check, adding only the expiry condition", () => {
      expect(isStaffForShopBody).toContain("p.id   = auth.uid()");
      expect(isStaffForShopBody).toContain("p.shop_id = _shop");
      expect(isStaffForShopBody).toContain(
        "p.role in ('owner','admin','manager','advisor','parts','mechanic')",
      );
      expect(isStaffForShopBody).toContain(
        "and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())",
      );
    });

    it("preserves its function/security/search-path characteristics and is not turned into a delegate", () => {
      expect(isStaffForShopBody).toContain('LANGUAGE "sql" STABLE');
      expect(isStaffForShopBody).not.toContain("SECURITY DEFINER");
      expect(isStaffForShopBody).toContain(
        "SET search_path TO 'public, extensions, pg_temp'",
      );
      expect(isStaffForShopBody).not.toContain("is_shop_member");
      expect(isStaffForShopBody).not.toContain("shop_role");
    });
  });

  describe("is_shop_member_v2()/shop_role_v2() inheritance", () => {
    it("is not redefined by this migration, so it keeps delegating to the now-expiry-aware helpers", () => {
      expect(migration).not.toContain("is_shop_member_v2");
      expect(migration).not.toContain("shop_role_v2");
    });

    it("their existing definitions are pure delegations to is_shop_member()/shop_role()", () => {
      expect(delegationMigration).toMatch(
        /CREATE OR REPLACE FUNCTION public\.is_shop_member_v2\(shop_id uuid\)[\s\S]{0,200}select public\.is_shop_member\(\$1\);/,
      );
      expect(delegationMigration).toMatch(
        /CREATE OR REPLACE FUNCTION public\.shop_role_v2\(shop_id uuid\)[\s\S]{0,200}select public\.shop_role\(\$1\);/,
      );
    });
  });
});
