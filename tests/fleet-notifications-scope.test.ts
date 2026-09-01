import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  reads: [] as Array<Record<string, unknown>>,
  page: {
    available: true,
    rows: [] as Array<Record<string, unknown>>,
    total: 0,
    nextOffset: null as number | null,
  },
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: vi.fn(() => ({})),
}));

vi.mock(
  "@/features/fleet/lib/resolveFleetActorContext",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("@/features/fleet/lib/resolveFleetActorContext")
      >();
    return {
      ...actual,
      resolveFleetActorContext: vi.fn(async () => state.actor),
    };
  },
);

vi.mock("@/features/shared/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

vi.mock("@/features/agent/server/syncAssistantNotifications", () => ({
  readAssistantNotificationPage: vi.fn(
    async (input: Record<string, unknown>) => {
      state.reads.push(input);
      return state.page;
    },
  ),
}));

import { POST } from "../app/api/fleet/notifications/route";

function request(body: Record<string, unknown> = {}): Request {
  return new Request("https://profixiq.com/api/fleet/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FLEET_A = "30000000-0000-4000-8000-00000000000a";
const FLEET_B = "30000000-0000-4000-8000-00000000000b";
const SHOP_A = "20000000-0000-4000-8000-00000000000a";
const SHOP_B = "20000000-0000-4000-8000-00000000000b";

function externalActor(
  memberships: Array<{ fleetId: string; role: string; shopId?: string }>,
) {
  return {
    userId: "user-1",
    shopId: SHOP_A,
    isInternal: false,
    canonicalRole: "customer",
    fleetIds: memberships.map((m) => m.fleetId),
    fleetMemberships: memberships.map((m) => ({
      fleetId: m.fleetId,
      shopId: m.shopId ?? SHOP_A,
      role: m.role,
    })),
    capabilities: { canSeeFleetWideUnits: true },
  };
}

function externalManager(fleetIds: string[]) {
  return externalActor(
    fleetIds.map((fleetId) => ({ fleetId, role: "manager" })),
  );
}

describe("Fleet alert feed scope", () => {
  beforeEach(() => {
    state.reads = [];
    state.page = {
      available: true,
      rows: [],
      total: 0,
      nextOffset: null,
    };
    state.actor = externalManager([FLEET_A]);
  });

  it("rejects an unauthenticated caller", async () => {
    state.actor = {
      userId: null,
      capabilities: { canSeeFleetWideUnits: false },
    };
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("returns nothing for a driver, who reports defects rather than reviewing them", async () => {
    state.actor = {
      ...externalActor([{ fleetId: FLEET_A, role: "viewer" }]),
      capabilities: { canSeeFleetWideUnits: false },
    };
    const response = await POST(request());
    const body = (await response.json()) as { notifications: unknown[] };
    expect(response.status).toBe(200);
    expect(body.notifications).toEqual([]);
    expect(state.reads).toEqual([]);
  });

  it("reads only fleet-sourced alerts for the caller's own shop", async () => {
    await POST(request());
    expect(state.reads[0]).toMatchObject({
      scopes: [{ shopId: SHOP_A, fleetIds: [FLEET_A] }],
      source: "fleet",
      statuses: ["active", "acknowledged"],
    });
  });

  it("pins an external Fleet actor to their entitled fleets", async () => {
    state.actor = externalManager([FLEET_A]);
    await POST(request());
    expect(state.reads[0]?.scopes).toEqual([
      { shopId: SHOP_A, fleetIds: [FLEET_A] },
    ]);
  });

  it("never widens to a fleet the caller is not entitled to", async () => {
    state.actor = externalManager([FLEET_A]);
    const body = (await (await POST(request({ fleetId: FLEET_B }))).json()) as {
      notifications: unknown[];
    };
    expect(body.notifications).toEqual([]);
    expect(state.reads).toEqual([]);
  });

  it("does not fleet-filter internal shop staff, who are shop-scoped already", async () => {
    state.actor = {
      userId: "user-1",
      shopId: SHOP_A,
      isInternal: true,
      canonicalRole: "owner",
      fleetIds: [],
      fleetMemberships: [],
      capabilities: { canSeeFleetWideUnits: true },
    };
    await POST(request());
    expect(state.reads[0]?.scopes).toEqual([
      { shopId: SHOP_A, fleetIds: null },
    ]);
  });

  it("never exposes a fleet the actor only drives for, even when they manage another", async () => {
    state.actor = externalActor([
      { fleetId: FLEET_A, role: "manager" },
      { fleetId: FLEET_B, role: "viewer" },
    ]);
    await POST(request());
    expect(state.reads[0]?.scopes).toEqual([
      { shopId: SHOP_A, fleetIds: [FLEET_A] },
    ]);
  });

  it("refuses a requested fleet the actor only drives for", async () => {
    state.actor = externalActor([
      { fleetId: FLEET_A, role: "manager" },
      { fleetId: FLEET_B, role: "viewer" },
    ]);
    const body = (await (await POST(request({ fleetId: FLEET_B }))).json()) as {
      notifications: unknown[];
    };
    expect(body.notifications).toEqual([]);
    expect(state.reads).toEqual([]);
  });

  it("maps the fleet id out of notification metadata", async () => {
    state.page = {
      available: true,
      total: 1,
      nextOffset: null,
      rows: [
        {
          id: "n1",
          level: "critical",
          code: "fleet_pretrip_defect",
          title: "1 pre-trip defect needs review",
          message: "Unit 42 was submitted with defects.",
          href: "/fleet?focus=defects",
          entity_type: "fleet_pretrip_report",
          entity_id: "r1",
          status: "active",
          metadata: { fleet_id: FLEET_A },
          last_seen_at: "2026-08-30T00:00:00.000Z",
        },
      ],
    };
    const body = (await (await POST(request())).json()) as {
      notifications: Array<{ fleetId?: string; level: string }>;
    };
    expect(body.notifications[0]).toMatchObject({
      fleetId: FLEET_A,
      level: "critical",
    });
  });

  it("serves an actor whose manageable membership is not the first one", async () => {
    state.actor = externalActor([
      { fleetId: FLEET_B, role: "viewer" },
      { fleetId: FLEET_A, role: "manager" },
    ]);
    state.actor.capabilities = { canSeeFleetWideUnits: false };
    await POST(request());
    expect(state.reads[0]?.scopes).toEqual([
      { shopId: SHOP_A, fleetIds: [FLEET_A] },
    ]);
  });

  it("still returns nothing for an actor who manages no fleet", async () => {
    state.actor = externalActor([{ fleetId: FLEET_A, role: "viewer" }]);
    const body = (await (await POST(request())).json()) as {
      notifications: unknown[];
    };
    expect(body.notifications).toEqual([]);
    expect(state.reads).toEqual([]);
  });

  it("preserves each manageable Fleet's shop boundary across memberships", async () => {
    state.actor = externalActor([
      { fleetId: FLEET_A, role: "manager", shopId: SHOP_A },
      { fleetId: FLEET_B, role: "dispatcher", shopId: SHOP_B },
    ]);

    await POST(request());

    expect(state.reads[0]?.scopes).toEqual([
      { shopId: SHOP_A, fleetIds: [FLEET_A] },
      { shopId: SHOP_B, fleetIds: [FLEET_B] },
    ]);
  });

  it("paginates instead of silently dropping alerts after the first 50", async () => {
    state.page = {
      available: true,
      total: 53,
      nextOffset: null,
      rows: Array.from({ length: 3 }, (_, index) => ({
        id: `n-${index + 51}`,
        level: "warning",
        code: "fleet_pretrip_missing",
        title: "Missed pre-trip",
        message: "Needs review",
        href: "/fleet?focus=defects",
        entity_type: "fleet_pretrip_report",
        entity_id: `00000000-0000-4000-8000-${String(index + 51).padStart(12, "0")}`,
        status: "active",
        metadata: { fleet_id: FLEET_A },
        last_seen_at: "2026-08-30T00:00:00.000Z",
      })),
    };

    const body = (await (await POST(request({ offset: 50 }))).json()) as {
      notifications: unknown[];
      total: number;
      nextOffset: number | null;
    };

    expect(state.reads[0]).toMatchObject({ offset: 50, pageSize: 50 });
    expect(body.notifications).toHaveLength(3);
    expect(body.total).toBe(53);
    expect(body.nextOffset).toBeNull();
  });
});
