import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const deliveryMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260902020000_fleet_invite_delivery_state.sql",
  ),
  "utf8",
);
const atomicMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260902030000_fleet_owner_invitation_atomic.sql",
  ),
  "utf8",
);

const fixture = vi.hoisted(() => ({
  insertPayload: null as Record<string, unknown> | null,
  invitePayload: null as Record<string, unknown> | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  inviteUpdates: [] as Array<Record<string, unknown>>,
  inviteUpdateError: null as { code?: string } | null,
  existingInvite: {
    data: {
      id: "33333333-3333-4333-8333-333333333333",
      fleet_id: "fleet-1",
      email: "owner@example.com",
      role: "manager",
      accepted_at: null,
    } as Record<string, unknown> | null,
    error: null as { code?: string } | null,
  },
  rpcResult: {
    data: [
      {
        fleet_id: "fleet-1",
        fleet_name: "Northside Transport",
        invite_id: "invite-1",
      },
    ] as unknown,
    error: null as { code?: string } | null,
  },
  deletedFleetIds: [] as string[],
  insertResult: {
    data: { id: "fleet-1", name: "Northside Transport" } as {
      id: string;
      name: string;
    } | null,
    error: null as { code?: string } | null,
  },
  inviteInsertResult: {
    data: { id: "invite-1" } as { id: string } | null,
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

// Chainable, awaitable stand-in for a supabase-js query builder.
function chain<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq", "is", "order", "limit", "update"]) {
    builder[key] = () => builder;
  }
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  builder.then = (resolve: (value: T) => unknown, reject?: unknown) =>
    Promise.resolve(result).then(resolve, reject as never);
  return builder;
}

vi.mock("@/features/shared/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      fixture.rpcCalls.push({ name, args });
      return fixture.rpcResult;
    }),
    from: vi.fn((table: string) => {
      if (table === "customers") return chain(fixture.customerResult);
      if (table === "shops") {
        return chain({
          data: { name: "Demo Shop", shop_name: "Demo Shop" },
          error: null,
        });
      }
      if (table === "fleet_portal_invites") {
        const builder = chain(fixture.existingInvite) as Record<
          string,
          unknown
        >;
        builder.update = (payload: Record<string, unknown>) => {
          fixture.inviteUpdates.push(payload);
          return chain({ data: null, error: fixture.inviteUpdateError });
        };
        builder.insert = (payload: Record<string, unknown>) => {
          fixture.invitePayload = payload;
          return {
            select: () => ({ single: async () => fixture.inviteInsertResult }),
          };
        };
        return builder;
      }
      if (table !== "fleets") throw new Error(`Unexpected table: ${table}`);
      const fleetBuilder: Record<string, unknown> = {
        select() {
          return chain({
            data: {
              id: "fleet-1",
              name: "Northside Transport",
              shop_id: "shop-1",
            },
            error: null,
          });
        },
        insert(payload: Record<string, unknown>) {
          fixture.insertPayload = payload;
          return {
            select() {
              return { single: async () => fixture.insertResult };
            },
          };
        },
        delete() {
          const target: Record<string, unknown> = {
            eq(column: string, value: string) {
              if (column === "id") fixture.deletedFleetIds.push(value);
              return target;
            },
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve),
          };
          return target;
        },
      };
      return fleetBuilder;
    }),
  },
}));

const sendPortalInviteEmail = vi.hoisted(() => vi.fn());

vi.mock("@/features/email/server", () => ({ sendPortalInviteEmail }));

vi.mock("@/features/branding/server/getActiveBrandForRender", () => ({
  getActiveBrandForRender: vi.fn(async () => null),
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
    fixture.invitePayload = null;
    fixture.rpcCalls = [];
    fixture.inviteUpdates = [];
    fixture.inviteUpdateError = null;
    fixture.existingInvite = {
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        fleet_id: "fleet-1",
        email: "owner@example.com",
        role: "manager",
        accepted_at: null,
      },
      error: null,
    };
    fixture.rpcResult = {
      data: [
        {
          fleet_id: "fleet-1",
          fleet_name: "Northside Transport",
          invite_id: "33333333-3333-4333-8333-333333333333",
        },
      ],
      error: null,
    };
    fixture.deletedFleetIds = [];
    fixture.inviteInsertResult = { data: { id: "invite-1" }, error: null };
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
    sendPortalInviteEmail.mockReset();
    sendPortalInviteEmail.mockResolvedValue({ status: "sent" });
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
    expect(fixture.rpcCalls).toHaveLength(1);
    expect(fixture.rpcCalls[0].args).toMatchObject({
      p_shop_id: "shop-1",
      p_name: "Northside Transport",
      p_contact_name: "Morgan Lee",
      p_contact_email: "fleet@example.com",
      p_created_by: "auth-user-1",
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
    expect(fixture.rpcCalls).toEqual([]);
  });

  it("links a same-Shop customer without creating a duplicate customer", async () => {
    const customerId = "11111111-1111-4111-8111-111111111111";
    const response = await POST(
      createRequest({ action: "create_fleet", customerId, name: "" }),
    );

    expect(response.status).toBe(201);
    expect(fixture.rpcCalls[0].args).toMatchObject({
      p_shop_id: "shop-1",
      p_customer_id: customerId,
      p_name: "Northside Transport",
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
    expect(fixture.rpcCalls).toEqual([]);
  });

  it("returns a stable conflict for a duplicate Fleet name", async () => {
    fixture.rpcResult = { data: null, error: { code: "23505" } };

    const response = await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe(
      "A Fleet relationship with this name already exists.",
    );
  });

  it("refuses to create a Fleet with no resolvable contact email", async () => {
    const response = await POST(
      createRequest({ action: "create_fleet", name: "Northside Transport" }),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(fixture.rpcCalls).toEqual([]);
    expect(body.error).toContain("contact email is required");
  });

  it("creates the Fleet and its owning invitation in one atomic call", async () => {
    const response = await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );
    const body = (await response.json()) as {
      invitedEmail?: string;
      invitationDelivered?: boolean;
    };

    expect(response.status).toBe(201);
    expect(fixture.rpcCalls[0].name).toBe(
      "create_fleet_with_owner_invitation_atomic",
    );
    expect(fixture.rpcCalls[0].args).toMatchObject({
      p_contact_email: "fleet@example.com",
      p_created_by: "auth-user-1",
    });
    expect(fixture.rpcCalls[0].args).not.toHaveProperty("p_role");
    expect(fixture.rpcCalls[0].args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sendPortalInviteEmail).toHaveBeenCalledTimes(1);
    expect(sendPortalInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: "profile-1" }),
    );
    expect(body.invitedEmail).toBe("fleet@example.com");
    expect(body.invitationDelivered).toBe(true);
  });

  it("never deletes the Fleet to compensate, because the customer side effect cannot be undone", async () => {
    sendPortalInviteEmail.mockRejectedValue(new Error("smtp down"));

    const response = await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );
    const body = (await response.json()) as {
      invitationDelivered?: boolean;
      deliveryIssue?: string;
    };

    expect(response.status).toBe(201);
    expect(fixture.deletedFleetIds).toEqual([]);
    expect(body.invitationDelivered).toBe(false);
    expect(body.deliveryIssue).toBe("failed");
  });

  it("does not claim delivery when the recipient is suppressed", async () => {
    // sendDynamicTemplateEmail resolves rather than throwing for a suppressed
    // address, so a discarded result would report a sent invitation that the
    // owner never receives.
    sendPortalInviteEmail.mockResolvedValue({
      status: "suppressed",
      reason: "bounced",
    });

    const response = await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );
    const body = (await response.json()) as {
      invitationDelivered?: boolean;
      deliveryIssue?: string;
    };

    expect(response.status).toBe(201);
    expect(body.invitationDelivered).toBe(false);
    expect(body.deliveryIssue).toBe("suppressed");
  });

  it("revokes a standalone invitation whose recipient is suppressed", async () => {
    sendPortalInviteEmail.mockResolvedValue({
      status: "suppressed",
      reason: "bounced",
    });

    const response = await POST(
      createRequest({
        fleetId: "fleet-1",
        email: "driver@example.com",
        role: "viewer",
      }),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(body.error).toContain("suppressed");
  });

  it("persists a failed delivery so it survives the response that reported it", async () => {
    sendPortalInviteEmail.mockRejectedValue(new Error("smtp down"));

    await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );

    expect(fixture.inviteUpdates).toContainEqual(
      expect.objectContaining({ delivery_status: "failed" }),
    );
  });

  it("persists a suppressed delivery distinctly from a failure", async () => {
    sendPortalInviteEmail.mockResolvedValue({ status: "suppressed" });

    await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );

    expect(fixture.inviteUpdates).toContainEqual(
      expect.objectContaining({ delivery_status: "suppressed" }),
    );
  });

  it("records a successful delivery and clears any prior error", async () => {
    await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );

    expect(fixture.inviteUpdates).toContainEqual(
      expect.objectContaining({
        delivery_status: "delivered",
        delivery_error: null,
      }),
    );
  });

  it("reports a delivery-state persistence failure while leaving the durable pending row retryable", async () => {
    fixture.inviteUpdateError = { code: "08006" };

    const response = await POST(
      createRequest({
        action: "create_fleet",
        name: "Northside Transport",
        contactEmail: "fleet@example.com",
      }),
    );
    const body = (await response.json()) as {
      deliveryStatePersisted?: boolean;
    };

    expect(response.status).toBe(201);
    expect(body.deliveryStatePersisted).toBe(false);
  });

  it("resends an invitation with its stored role, never the form default", async () => {
    fixture.rpcResult = {
      data: [
        {
          invite_id: "44444444-4444-4444-8444-444444444444",
          fleet_id: "fleet-1",
          fleet_name: "Northside Transport",
          invite_email: "owner@example.com",
          invite_role: "manager",
        },
      ],
      error: null,
    };
    const response = await POST(
      createRequest({
        action: "resend_invite",
        inviteId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    const body = (await response.json()) as { role?: string; email?: string };

    expect(response.status).toBe(200);
    // The owning manager invitation must not come back as a viewer.
    expect(body.role).toBe("manager");
    expect(body.email).toBe("owner@example.com");
    expect(fixture.rpcCalls[0]).toMatchObject({
      name: "replace_fleet_portal_invitation_atomic",
      args: {
        p_shop_id: "shop-1",
        p_invite_id: "33333333-3333-4333-8333-333333333333",
        p_created_by: "auth-user-1",
      },
    });
  });

  it("refuses to resend an already accepted invitation", async () => {
    fixture.rpcResult = { data: null, error: { code: "23514" } };

    const response = await POST(
      createRequest({
        action: "resend_invite",
        inviteId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(response.status).toBe(409);
  });

  it("rejects a malformed invitation reference before reading", async () => {
    const response = await POST(
      createRequest({ action: "resend_invite", inviteId: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps delivery tracking additive and starts new invitations as pending", () => {
    expect(deliveryMigration).toContain(
      "add column if not exists delivery_status text",
    );
    expect(deliveryMigration).not.toContain("add constraint");
    expect(atomicMigration).toContain("'pending'");
  });

  it("serializes invitation replacement before any resend email is sent", () => {
    expect(atomicMigration).toContain("for update");
    expect(atomicMigration).toContain("v_existing.revoked_at is not null");
    expect(atomicMigration).toContain(
      "create or replace function public.replace_fleet_portal_invitation_atomic",
    );
  });
});
