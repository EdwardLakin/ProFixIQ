import { describe, expect, it, vi } from "vitest";

import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const PROFILE_ID = "10000000-0000-4000-8000-000000000002";
const SHOP_A = "20000000-0000-4000-8000-00000000000a";
const SHOP_B = "20000000-0000-4000-8000-00000000000b";
const FLEET_A = "30000000-0000-4000-8000-00000000000a";
const FLEET_B = "30000000-0000-4000-8000-00000000000b";

function actorClient() {
  const profileQuery: Record<string, unknown> = {};
  profileQuery.select = () => profileQuery;
  profileQuery.eq = () => profileQuery;
  profileQuery.maybeSingle = async () => ({
    data: { id: PROFILE_ID, role: "customer", shop_id: SHOP_A },
    error: null,
  });

  const membershipQuery: Record<string, unknown> = {};
  membershipQuery.select = () => membershipQuery;
  membershipQuery.eq = () => membershipQuery;
  membershipQuery.order = async () => ({
    data: [
      { fleet_id: FLEET_A, shop_id: SHOP_A, role: "viewer" },
      { fleet_id: FLEET_B, shop_id: SHOP_B, role: "manager" },
    ],
    error: null,
  });

  return {
    auth: { getUser: vi.fn() },
    from: vi.fn((table: string) => {
      if (table === "profiles") return profileQuery;
      if (table === "fleet_members") return membershipQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async (name: string) => ({
      data: name === "profixiq_fleet_has_product_access",
      error: null,
    })),
  };
}

describe("selected Fleet membership scope", () => {
  it("keeps the actor contract stable and scopes an explicit Fleet to its trusted shop", async () => {
    const actor = await resolveFleetActorContext(actorClient() as never, {
      userId: USER_ID,
      requestedFleetId: FLEET_B,
    });

    expect(actor).toMatchObject({
      actorType: "fleet_manager",
      profileShopId: SHOP_A,
      shopId: SHOP_A,
      primaryFleetId: FLEET_B,
      membershipRole: "manager",
    });
    expect(
      resolveFleetActorScope(actor, { explicitFleetId: FLEET_B }),
    ).toEqual({
      shopId: SHOP_B,
      fleetId: FLEET_B,
      fleetIds: [FLEET_B],
    });
    expect(
      resolveFleetActorScope(actor, {
        explicitFleetId: FLEET_B,
        explicitShopId: SHOP_A,
      }),
    ).toBeNull();

    const unrequestedActor = await resolveFleetActorContext(
      actorClient() as never,
      { userId: USER_ID },
    );
    expect(unrequestedActor).toMatchObject({
      shopId: SHOP_A,
      primaryFleetId: FLEET_A,
      membershipRole: "viewer",
    });
    expect(resolveFleetActorScope(unrequestedActor)).toEqual({
      shopId: SHOP_A,
      fleetId: FLEET_A,
      fleetIds: [FLEET_A, FLEET_B],
    });
  });
});
