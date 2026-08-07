import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildShopUserAuthEmail,
  buildShopUsernameNamespace,
  getAuthIdentifierStrategy,
  normalizeAuthIdentifier,
  normalizeLoginUsername,
  normalizeProvisioningUsername,
} from "../features/users/lib/username";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
  assertShopHasAvailableSeat: vi.fn(),
  sendUserInviteEmail: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

vi.mock("@/features/shared/lib/server/shop-seat-limit", () => ({
  assertShopHasAvailableSeat: mocks.assertShopHasAvailableSeat,
}));

vi.mock("@/features/email/server", () => ({
  sendUserInviteEmail: mocks.sendUserInviteEmail,
}));

type CreateUserPayload = {
  email: string;
  password: string;
  email_confirm: boolean;
  user_metadata?: Record<string, unknown>;
};

type ProfileUpsertPayload = {
  id: string;
  email?: string | null;
  username?: string | null;
  shop_id?: string | null;
};

type MembershipUpsertPayload = {
  shop_id: string;
  user_id: string;
  role: string;
  created_by: string;
};

type MockAdminOptions = {
  shopId?: string;
  adminId?: string;
  shopName?: string;
  sameShopProfiles?: { id: string; username: string | null }[];
  createdUserId?: string;
  canonicalRole?: "owner" | "admin";
  profileUpsertError?: string | null;
  membershipUpsertError?: string | null;
  workforceUpsertError?: string | null;
  deleteUserError?: string | null;
};

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/admin/create-user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildCreateUserRouteMocks(options: MockAdminOptions = {}) {
  const shopId = options.shopId ?? "shop-1";
  const adminId = options.adminId ?? "admin-1";
  const createdUserId = options.createdUserId ?? "created-user-1";
  const createUser = vi.fn(async (_payload: CreateUserPayload) => ({
    data: { user: { id: createdUserId } },
    error: null,
  }));
  const deleteUser = vi.fn(async (_userId: string) => ({
    error: options.deleteUserError ? { message: options.deleteUserError } : null,
  }));
  const profileUpsert = vi.fn(async (_payload: ProfileUpsertPayload) => ({
    error: options.profileUpsertError ? { message: options.profileUpsertError } : null,
  }));
  const membershipUpsert = vi.fn(async (_payload: MembershipUpsertPayload) => ({
    error: options.membershipUpsertError
      ? { message: options.membershipUpsertError }
      : null,
  }));
  const workforceUpsert = vi.fn(async (_payload: Record<string, unknown>) => ({
    error: options.workforceUpsertError ? { message: options.workforceUpsertError } : null,
  }));
  const deleteRow = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }));

  const adminClient = {
    auth: { admin: { createUser, deleteUser } },
    from: vi.fn((table: string) => {
      if (table === "shops") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { name: options.shopName ?? "Downtown Diesel", shop_name: null },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: adminId,
                  full_name: "Owner Admin",
                  first_name: "Owner",
                  last_name: "Admin",
                },
                error: null,
              }),
              ilike: () => ({
                limit: async () => ({ data: options.sameShopProfiles ?? [], error: null }),
              }),
            }),
          }),
          upsert: profileUpsert,
          delete: deleteRow,
        };
      }

      if (table === "people_workforce_profiles") {
        return { upsert: workforceUpsert, delete: deleteRow };
      }

      if (table === "shop_members") {
        return { upsert: membershipUpsert, delete: deleteRow };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: adminId, shop_id: shopId },
    canonicalRole: options.canonicalRole ?? "owner",
    supabase: adminClient,
  });
  mocks.createAdminSupabase.mockReturnValue(adminClient);
  mocks.assertShopHasAvailableSeat.mockResolvedValue(undefined);
  mocks.sendUserInviteEmail.mockResolvedValue(undefined);

  return {
    createUser,
    deleteUser,
    profileUpsert,
    membershipUpsert,
    workforceUpsert,
    shopId,
    adminId,
    createdUserId,
  };
}

describe("shop user auth normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the same synthetic auth email for created usernames and username sign-in", () => {
    const namespace = buildShopUsernameNamespace("Downtown Diesel");
    const username = normalizeProvisioningUsername(" Sam Tech ", namespace);

    expect(username).toBe("downtowndiessamtech");
    expect(buildShopUserAuthEmail(username)).toBe("downtowndiessamtech@local.profix-internal");
    expect(normalizeAuthIdentifier(username)).toBe(
      "downtowndiessamtech@local.profix-internal",
    );
  });

  it("normalizes username-only login exactly like backing auth email creation", () => {
    expect(normalizeLoginUsername(" Shop.User-01 ")).toBe("shopuser01");
    expect(normalizeAuthIdentifier(" Shop.User-01 ")).toBe("shopuser01@local.profix-internal");
  });

  it("preserves explicit email login as lower-case email auth for email users", () => {
    expect(normalizeAuthIdentifier(" Person@Example.COM ")).toBe("person@example.com");
    expect(getAuthIdentifierStrategy(" Person@Example.COM ")).toEqual({
      inputKind: "email",
      authEmail: "person@example.com",
    });
  });

  it("normalizes uppercase, spaces, and punctuation consistently for username auth", () => {
    const raw = "  Sam.Tech + Night-01  ";

    expect(normalizeLoginUsername(raw)).toBe("samtechnight01");
    expect(getAuthIdentifierStrategy(raw)).toEqual({
      inputKind: "username",
      authEmail: "samtechnight01@local.profix-internal",
    });
  });

  it("creates username-only staff users with a synthetic auth email", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const {
      createUser,
      profileUpsert,
      membershipUpsert,
      shopId,
      adminId,
      createdUserId,
    } = buildCreateUserRouteMocks();
    const password = " Temp Password 123 ";

    const response = await POST(jsonRequest({
      username: " Sam Tech ",
      password,
      full_name: "Sam Tech",
      role: "mechanic",
      shop_id: "client-supplied-shop",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "downtowndiessamtech@local.profix-internal",
      password,
      email_confirm: true,
    }));
    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createdUserId,
        email: null,
        username: "downtowndiessamtech",
        shop_id: shopId,
      }),
      { onConflict: "id" },
    );
    expect(membershipUpsert).toHaveBeenCalledWith(
      {
        shop_id: shopId,
        user_id: createdUserId,
        role: "mechanic",
        created_by: adminId,
      },
      { onConflict: "shop_id,user_id" },
    );
    expect(payload).toEqual(expect.objectContaining({
      username: "downtowndiessamtech",
      email: null,
      auth_email: "downtowndiessamtech@local.profix-internal",
      shop_id: shopId,
    }));
  });

  it("creates username plus contact email staff users with username as auth identity", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { createUser, profileUpsert } = buildCreateUserRouteMocks();

    const response = await POST(jsonRequest({
      username: "Sam.Tech",
      email: " Sam.Tech@Example.COM ",
      password: "temporary-password",
      full_name: "Sam Tech",
      role: "advisor",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "downtowndiessamtech@local.profix-internal",
      email_confirm: true,
      user_metadata: expect.objectContaining({
        username: "downtowndiessamtech",
        contact_email: "sam.tech@example.com",
      }),
    }));
    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "sam.tech@example.com",
        username: "downtowndiessamtech",
      }),
      { onConflict: "id" },
    );
    expect(payload).toEqual(expect.objectContaining({
      username: "downtowndiessamtech",
      email: "sam.tech@example.com",
      auth_email: "downtowndiessamtech@local.profix-internal",
    }));
  });

  it("blocks duplicate usernames within the same shop before creating auth users", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { createUser } = buildCreateUserRouteMocks({
      sameShopProfiles: [{ id: "existing-user", username: "downtowndiessamtech" }],
    });

    const response = await POST(jsonRequest({
      username: "Sam Tech",
      password: "temporary-password",
      full_name: "Sam Tech",
      role: "mechanic",
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("A user with this username already exists in this shop.");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rolls back the auth account when profile provisioning fails", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { deleteUser, createdUserId } = buildCreateUserRouteMocks({
      profileUpsertError: "database unavailable",
    });
    const response = await POST(jsonRequest({
      username: "Sam Tech", password: "temporary-password", full_name: "Sam Tech", role: "mechanic",
    }));
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.code).toBe("profile_upsert_failed");
    expect(deleteUser).toHaveBeenCalledWith(createdUserId);
  });

  it("rolls back the auth account when workforce provisioning fails", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { deleteUser, createdUserId } = buildCreateUserRouteMocks({
      workforceUpsertError: "workforce unavailable",
    });
    const response = await POST(jsonRequest({
      username: "Sam Tech", password: "temporary-password", full_name: "Sam Tech", role: "mechanic",
    }));
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.code).toBe("workforce_profile_seed_failed");
    expect(deleteUser).toHaveBeenCalledWith(createdUserId);
  });

  it("rolls back the auth account when canonical membership provisioning fails", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { deleteUser, createdUserId, workforceUpsert } = buildCreateUserRouteMocks({
      membershipUpsertError: "membership unavailable",
    });
    const response = await POST(jsonRequest({
      username: "Sam Tech", password: "temporary-password", full_name: "Sam Tech", role: "mechanic",
    }));
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.code).toBe("shop_membership_seed_failed");
    expect(deleteUser).toHaveBeenCalledWith(createdUserId);
    expect(workforceUpsert).not.toHaveBeenCalled();
  });

  it("reports an actionable partial-provisioning error when rollback fails", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    buildCreateUserRouteMocks({
      profileUpsertError: "database unavailable",
      deleteUserError: "auth cleanup unavailable",
    });
    const response = await POST(jsonRequest({
      username: "Sam Tech", password: "temporary-password", full_name: "Sam Tech", role: "mechanic",
    }));
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.code).toBe("provisioning_rollback_failed");
    expect(payload.error).toContain("Contact support before retrying");
  });

  it("prevents admins from creating owner or admin accounts", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { createUser } = buildCreateUserRouteMocks({ canonicalRole: "admin" });
    const response = await POST(jsonRequest({
      username: "Another Owner", password: "temporary-password", full_name: "Another Owner", role: "owner",
    }));
    expect(response.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("validates required staff identity fields before provisioning", async () => {
    const { POST } = await import("../app/api/admin/create-user/route");
    const { createUser } = buildCreateUserRouteMocks();
    const missingName = await POST(jsonRequest({
      username: "Sam Tech", password: "temporary-password", role: "mechanic",
    }));
    const shortPassword = await POST(jsonRequest({
      username: "Sam Tech", password: "short", full_name: "Sam Tech", role: "mechanic",
    }));
    expect(missingName.status).toBe(400);
    expect(shortPassword.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("uses the server-side shop namespace, so different shop namespaces produce different usernames and auth emails", () => {
    const firstShopUsername = normalizeProvisioningUsername(
      "Sam Tech",
      buildShopUsernameNamespace("Downtown Diesel"),
    );
    const secondShopUsername = normalizeProvisioningUsername(
      "Sam Tech",
      buildShopUsernameNamespace("Uptown Fleet"),
    );

    expect(firstShopUsername).toBe("downtowndiessamtech");
    expect(secondShopUsername).toBe("uptownfleetsamtech");
    expect(buildShopUserAuthEmail(firstShopUsername)).not.toBe(
      buildShopUserAuthEmail(secondShopUsername),
    );
  });

  it("retires the public login-resolution endpoint to prevent account enumeration", async () => {
    const { POST } = await import("../app/api/auth/resolve-login/route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).not.toHaveProperty("authEmail");
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

});
