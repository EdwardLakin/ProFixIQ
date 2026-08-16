import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clearCanonicalPasswordRequirement } from "@/features/auth/server/passwordActivation";

type Profile = {
  id: string;
  user_id?: string | null;
  role: string;
  shop_id: string;
  completed_onboarding: boolean;
  must_change_password: boolean;
  email: string;
  full_name: string;
};

function createReadClient(profile: Profile | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data:
              profile &&
              ((column === "id" && profile.id === value) ||
                (column === "user_id" && profile.user_id === value))
                ? profile
                : null,
            error: null,
          }),
        })),
      })),
    })),
  };
}

function createAdminClient(profile: Profile | null, updated: Profile | null) {
  const updateEq = vi.fn(() => ({
    select: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
    })),
  }));

  return {
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((column: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                profile && column === "user_id" && profile.user_id === value
                  ? profile
                  : null,
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({ eq: updateEq })),
      })),
    },
    updateEq,
  };
}

const linkedProfile: Profile = {
  id: "canonical-profile-1",
  user_id: "auth-user-1",
  role: "technician",
  shop_id: "shop-1",
  completed_onboarding: true,
  must_change_password: true,
  email: "tech@example.com",
  full_name: "Field Tech",
};

describe("canonical password activation", () => {
  it("updates and verifies the exact linked canonical profile row", async () => {
    const sessionClient = createReadClient(null);
    const admin = createAdminClient(linkedProfile, {
      ...linkedProfile,
      must_change_password: false,
    });

    const result = await clearCanonicalPasswordRequirement({
      authUserId: "auth-user-1",
      sessionClient: sessionClient as never,
      adminClient: admin.client as never,
    });

    expect(result).toEqual({ ok: true, profileUpdated: true });
    expect(admin.updateEq).toHaveBeenCalledWith("id", "canonical-profile-1");
  });

  it("fails instead of reporting success when no updated row is returned", async () => {
    const sessionClient = createReadClient(null);
    const admin = createAdminClient(linkedProfile, null);

    const result = await clearCanonicalPasswordRequirement({
      authUserId: "auth-user-1",
      sessionClient: sessionClient as never,
      adminClient: admin.client as never,
    });

    expect(result).toEqual({
      ok: false,
      detail: "Canonical profile password activation was not persisted.",
    });
  });

  it("keeps portal-only and pre-profile password changes as no-op success", async () => {
    const sessionClient = createReadClient(null);
    const admin = createAdminClient(null, null);

    const result = await clearCanonicalPasswordRequirement({
      authUserId: "portal-user-1",
      sessionClient: sessionClient as never,
      adminClient: admin.client as never,
    });

    expect(result).toEqual({ ok: true, profileUpdated: false });
    expect(admin.updateEq).not.toHaveBeenCalled();
  });
});
