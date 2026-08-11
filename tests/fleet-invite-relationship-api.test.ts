import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  insertPayload: null as Record<string, unknown> | null,
  insertResult: {
    data: { id: "fleet-1", name: "Northside Transport" } as {
      id: string;
      name: string;
    } | null,
    error: null as { code?: string } | null,
  },
  customerResult: {
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Northside Transport",
      business_name: "Northside Transport",
      first_name: "Morgan",
      last_name: "Lee",
      email: "fleet@example.com",
    } as Record<string, string | null> | null,
    error: null as { code?: string } | null,
  },
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: vi.fn(async () => ({
    ok: true,
    profile: { id: "profile-1", shop_id: "shop-1" },
    authUserId: "auth-user-1",
    canonicalRole: "owner",
    supabase: {},
  })),
}));

vi.mock("@/features/shared/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          maybeSingle: async () => fixture.customerResult,
        };
        return builder;
      }
      if (table !== "fleets") throw new Error(`Unexpected table: ${table}`);
      return {
        insert(payload: Record<string, unknown>) {
          fixture.insertPayload = payload;
          return {
            select() {
              return {
                single: async () => fixture.insertResult,
              };
            },
          };
        },
      };
    }),
  },
}));

vi.mock("@/features/email/server", () => ({
  sendPortalInviteEmail: vi.fn(),
}));

vi.mock("@/features/branding/server/getActiveBrandForRender", () => ({
  getActiveBrandForRender: vi.fn(),
}));

import { POST } from "../app/api/portal/fleet/invites/route";

function createRequest(body: Record<string, unknown>): Request {
  return new Request("https://profixiq.com/api/portal/fleet/invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Fleet relationship creation", () => {
  beforeEach(() => {
    fixture.insertPayload = null;
    fixture.insertResult = {
      data: { id: "fleet-1", name: "Northside Transport" },
      error: null,
    };
    fixture.customerResult = {
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Northside Transport",
        business_name: "Northside Transport",
        first_name: "Morgan",
        last_name: "Lee",
        email: "fleet@example.com",
      },
      error: null,
    };
  });

  it("uses the authenticated Shop scope and ignores client tenant claims", async () => {
    const response = await POST(
      createRequest({
        action: "create_fleet",
        shopId: "attacker-shop",
        name: "  Northside Transport  ",
        contactName: "  Morgan Lee  ",
        contactEmail: "  FLEET@EXAMPLE.COM  ",
      }),
    );

    expect(response.status).toBe(201);
    expect(fixture.insertPayload).toEqual({
      shop_id: "shop-1",
      name: "Northside Transport",
      contact_name: "Morgan Lee",
      contact_email: "fleet@example.com",
      notes: null,
    });
  });

  it("rejects invalid relationship details before writing", async () => {
    const response = await POST(
      createRequest({
        action: "create_fleet",
        name: "",
        contactEmail: "not-an-email",
      }),
    );

    expect(response.status).toBe(400);
    expect(fixture.insertPayload).toBeNull();
  });

  it("links a same-Shop customer without creating a duplicate customer", async () => {
    const customerId = "11111111-1111-4111-8111-111111111111";
    const response = await POST(
      createRequest({
        action: "create_fleet",
        customerId,
        name: "",
      }),
    );

    expect(response.status).toBe(201);
    expect(fixture.insertPayload).toMatchObject({
      shop_id: "shop-1",
      customer_id: customerId,
      name: "Northside Transport",
    });
  });

  it("rejects a customer outside the authenticated Shop scope", async () => {
    fixture.customerResult = { data: null, error: null };
    const response = await POST(
      createRequest({
        action: "create_fleet",
        customerId: "22222222-2222-4222-8222-222222222222",
        name: "Foreign Fleet",
      }),
    );

    expect(response.status).toBe(404);
    expect(fixture.insertPayload).toBeNull();
  });

  it("returns a stable conflict for a duplicate Fleet name", async () => {
    fixture.insertResult = { data: null, error: { code: "23505" } };

    const response = await POST(
      createRequest({ action: "create_fleet", name: "Northside Transport" }),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe(
      "A Fleet relationship with this name already exists.",
    );
  });
});
