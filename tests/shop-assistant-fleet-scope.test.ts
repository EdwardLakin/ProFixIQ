import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

const resolveFleetActorContextMock = vi.hoisted(() => vi.fn());
const createAdminSupabaseMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/fleet/lib/resolveFleetActorContext", () => ({
  resolveFleetActorContext: resolveFleetActorContextMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

import {
  convertFleetServiceRequestTool,
  listFleetUnitsTool,
} from "@/features/shop-assistant/server/tools/domains/fleet";

const universalMigration = readFileSync(
  "supabase/migrations/20260816220000_shop_assistant_universal_actions.sql",
  "utf8",
);
const fleetTools = readFileSync(
  "features/shop-assistant/server/tools/domains/fleet.ts",
  "utf8",
);

function sqlFunction(name: string): string {
  const marker = `create or replace function public.${name}(`;
  const start = universalMigration.indexOf(marker);
  if (start < 0) throw new Error(`Missing SQL function ${name}.`);
  const next = universalMigration.indexOf(
    "\ncreate or replace function public.",
    start + marker.length,
  );
  return universalMigration.slice(
    start,
    next < 0 ? universalMigration.length : next,
  );
}

function internalActor(fleetIds: string[]): FleetActorContext {
  return {
    userId: "10000000-0000-4000-8000-000000000001",
    actorType: "internal_staff",
    canonicalRole: "owner",
    profileRole: "owner",
    profileShopId: "20000000-0000-4000-8000-000000000001",
    shopId: "20000000-0000-4000-8000-000000000001",
    fleetIds,
    fleetMemberships: [],
    primaryFleetId: fleetIds[0] ?? null,
    membershipRole: null,
    isInternal: true,
    isFleetActor: false,
    capabilities: {
      canSeeFleetWideUnits: fleetIds.length > 0,
      canCreatePretripReports: fleetIds.length > 0,
      canConvertPretripToServiceRequest: fleetIds.length > 0,
      canAccessFleetIntake: fleetIds.length > 0,
      canAccessPortalFleetWrappers: fleetIds.length > 0,
      canRunFleetDispatchActions: fleetIds.length > 0,
      canOverrideShopScope: false,
    },
  };
}

function toolContext() {
  return {
    actor: {
      userId: "10000000-0000-4000-8000-000000000001",
      profileId: "10000000-0000-4000-8000-000000000001",
      shopId: "20000000-0000-4000-8000-000000000001",
      supabase: {},
    },
    threadId: "30000000-0000-4000-8000-000000000001",
    idempotencyKey: "fleet-scope-test",
  } as never;
}

describe("shop assistant Fleet scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not broaden internal staff without an entitled membership", async () => {
    const from = vi.fn();
    createAdminSupabaseMock.mockReturnValue({ from });
    resolveFleetActorContextMock.mockResolvedValue(internalActor([]));

    const result = await listFleetUnitsTool.execute(
      { limit: 25 },
      toolContext(),
    );

    expect(result.units).toEqual([]);
    expect(result.summary).toBe(
      "No fleet units are available to this account.",
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects conversion previews without an entitled membership", async () => {
    const from = vi.fn();
    createAdminSupabaseMock.mockReturnValue({ from });
    resolveFleetActorContextMock.mockResolvedValue(internalActor([]));

    await expect(
      convertFleetServiceRequestTool.preview?.(
        { serviceRequestId: "40000000-0000-4000-8000-000000000001" },
        toolContext(),
      ),
    ).rejects.toMatchObject({
      name: "ShopAssistantHttpError",
      status: 403,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("reauthorizes conversion and enforces membership plus product access in SQL", () => {
    const createRequest = sqlFunction(
      "shop_assistant_create_fleet_service_request_atomic",
    );
    const convertRequest = sqlFunction(
      "shop_assistant_convert_fleet_service_request_atomic",
    );

    expect(fleetTools).toContain("return actor.fleetIds;");
    expect(fleetTools).not.toContain("if (!actor.isInternal)");
    expect(
      fleetTools.match(/await loadAccessibleFleetServiceRequest\(/g),
    ).toHaveLength(2);
    for (const command of [createRequest, convertRequest]) {
      expect(command).toContain("public.profixiq_fleet_has_product_access(");
      expect(command).toContain("from public.fleet_members member");
      expect(command).toContain(
        "member.user_id in (v_actor_profile_id, p_actor_user_id)",
      );
    }
  });
});
