import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  filters: [] as Array<{ method: string; column: string; value: unknown }>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: vi.fn(() => ({})),
}));

// Only the actor resolution is stubbed. The scoping helpers keep their real
// role-tier logic, because that is precisely what these tests exercise.
vi.mock("@/features/fleet/lib/resolveFleetActorContext", async (importActual) => {
  const actual = await importActual<
    typeof import("@/features/fleet/lib/resolveFleetActorContext")
  >();
  return {
    ...actual,
    resolveFleetActorContext: vi.fn(async () => state.actor),
  };
});

vi.mock("@/features/shared/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      const record =
        (method: string) => (column: string, value: unknown) => {
          state.filters.push({ method, column, value });
          return builder;
        };
      builder.select = () => builder;
      builder.eq = record("eq");
      builder.in = record("in");
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(resolve);
      return builder;
    }),
  },
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

function externalActor(
  memberships: Array<{ fleetId: string; role: string }>,
) {
  return {
    userId: "user-1",
    shopId: "shop-1",
    isInternal: false,
    canonicalRole: "customer",
    fleetIds: memberships.map((m) => m.fleetId),
    fleetMemberships: memberships.map((m) => ({
      fleetId: m.fleetId,
      shopId: "shop-1",
      role: m.role,
    })),
    capabilities: { canSeeFleetWideUnits: true },
  };
}

function externalManager(fleetIds: string[]) {
  return externalActor(fleetIds.map((fleetId) => ({ fleetId, role: "manager" })));
}

describe("Fleet alert feed scope", () => {
  beforeEach(() => {
    state.filters = [];
    state.rows = [];
    state.actor = externalManager([FLEET_A]);
  });

  it("rejects an unauthenticated caller", async () => {
    state.actor = { userId: null, capabilities: { canSeeFleetWideUnits: false } };
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
    expect(state.filters).toEqual([]);
  });

  it("reads only fleet-sourced alerts for the caller's own shop", async () => {
    await POST(request());
    expect(state.filters).toContainEqual({
      method: "eq",
      column: "shop_id",
      value: "shop-1",
    });
    expect(state.filters).toContainEqual({
      method: "eq",
      column: "source",
      value: "fleet",
    });
  });

  it("pins an external Fleet actor to their entitled fleets", async () => {
    state.actor = externalManager([FLEET_A]);
    await POST(request());
    expect(state.filters).toContainEqual({
      method: "in",
      column: "metadata->>fleet_id",
      value: [FLEET_A],
    });
  });

  it("never widens to a fleet the caller is not entitled to", async () => {
    state.actor = externalManager([FLEET_A]);
    await POST(request({ fleetId: FLEET_B }));
    const body = (await (await POST(request({ fleetId: FLEET_B }))).json()) as {
      notifications: unknown[];
    };
    expect(body.notifications).toEqual([]);
    expect(
      state.filters.some((filter) =>
        JSON.stringify(filter.value).includes(FLEET_B),
      ),
    ).toBe(false);
  });

  it("does not fleet-filter internal shop staff, who are shop-scoped already", async () => {
    state.actor = {
      userId: "user-1",
      shopId: "shop-1",
      isInternal: true,
      canonicalRole: "owner",
      fleetIds: [],
      fleetMemberships: [],
      capabilities: { canSeeFleetWideUnits: true },
    };
    await POST(request());
    expect(
      state.filters.some((filter) => filter.column === "metadata->>fleet_id"),
    ).toBe(false);
  });

  it("never exposes a fleet the actor only drives for, even when they manage another", async () => {
    // canSeeFleetWideUnits is derived from one membership; it must not grant
    // manager visibility across every fleet the account belongs to.
    state.actor = externalActor([
      { fleetId: FLEET_A, role: "manager" },
      { fleetId: FLEET_B, role: "viewer" },
    ]);

    await POST(request());

    const fleetFilter = state.filters.find(
      (filter) => filter.column === "metadata->>fleet_id",
    );
    expect(fleetFilter?.value).toEqual([FLEET_A]);
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
    expect(
      state.filters.some((filter) => filter.column === "metadata->>fleet_id"),
    ).toBe(false);
  });

  it("maps the fleet id out of notification metadata", async () => {
    state.rows = [
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
    ];
    const body = (await (await POST(request())).json()) as {
      notifications: Array<{ fleetId?: string; level: string }>;
    };
    expect(body.notifications[0]).toMatchObject({
      fleetId: FLEET_A,
      level: "critical",
    });
  });
});
