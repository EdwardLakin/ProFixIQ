import { beforeEach, describe, expect, it, vi } from "vitest";

const getOpsNotificationsMock = vi.fn();

vi.mock("@/features/agent/server/getOpsNotifications", () => ({
  getOpsNotifications: getOpsNotificationsMock,
}));

type ExistingRow = {
  id: string;
  fingerprint: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
};

type UpdateCall = {
  payload: Record<string, unknown>;
  eqCalls: Array<[string, unknown]>;
};

type UpdateResponse = { data: Array<{ id: string }> | null; error: { message: string } | null };

function createSupabase(input: {
  existing: ExistingRow[];
  resolveResponses?: UpdateResponse[];
}) {
  const upsertCalls: unknown[] = [];
  const updateCalls: UpdateCall[] = [];
  const resolveResponses = [...(input.resolveResponses ?? [])];

  const selectQuery = {
    eq: vi.fn(() => Promise.resolve({ data: input.existing, error: null })),
  };

  type UpdateNode = {
    eq: (col: string, value: unknown) => UpdateNode;
    select: (columns: string) => Promise<UpdateResponse>;
  };

  function makeUpdateBuilder(payload: Record<string, unknown>): UpdateNode {
    const call: UpdateCall = { payload, eqCalls: [] };
    updateCalls.push(call);
    const node: UpdateNode = {
      eq: vi.fn((col: string, value: unknown) => {
        call.eqCalls.push([col, value]);
        return node;
      }),
      select: vi.fn(() => {
        const response = resolveResponses.shift() ?? { data: [{ id: "unknown" }], error: null };
        return Promise.resolve(response);
      }),
    };
    return node;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== "shop_blocker_observations") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => selectQuery),
        upsert: vi.fn((rows: unknown, _opts: unknown) => {
          upsertCalls.push(rows);
          return Promise.resolve({ error: null });
        }),
        update: vi.fn((payload: Record<string, unknown>) =>
          makeUpdateBuilder(payload),
        ),
      };
    }),
  };

  return { supabase, upsertCalls, updateCalls };
}

describe("syncShopBlockerObservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a new finding with a fresh first_seen_at and a reason snapshot including rule evidence", async () => {
    getOpsNotificationsMock.mockResolvedValue([
      {
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "WO waiting too long",
        message: "WO #A100 has been queued for 8 hours.",
        href: "/work-orders/wo-1",
        entityType: "work_order",
        entityId: "wo-1",
        evidence: { hoursQueued: 8, thresholdHours: 6 },
      },
    ]);

    const { supabase, upsertCalls } = createSupabase({ existing: [] });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const now = new Date("2026-09-14T12:00:00.000Z");
    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now,
    });

    expect(summary.opened).toBe(1);
    expect(summary.continuing).toBe(0);
    expect(summary.observed).toBe(1);
    expect(upsertCalls).toHaveLength(1);
    const [rows] = upsertCalls as [Array<Record<string, unknown>>];
    expect(rows[0]).toMatchObject({
      shop_id: "shop-1",
      code: "work_order_waiting_too_long",
      status: "active",
      first_seen_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    });
    expect(rows[0].reason).toMatchObject({
      code: "work_order_waiting_too_long",
      entity_id: "wo-1",
      message: "WO #A100 has been queued for 8 hours.",
      evidence: { hoursQueued: 8, thresholdHours: 6 },
    });
  });

  it("preserves first_seen_at for a continuing finding instead of resetting it", async () => {
    getOpsNotificationsMock.mockResolvedValue([
      {
        level: "critical",
        code: "approval_waiting",
        title: "Approval waiting",
        message: "Still waiting.",
        entityType: "work_order",
        entityId: "wo-2",
      },
    ]);

    const fingerprint = "shop::approval_waiting::work_order::wo-2";
    const { supabase, upsertCalls } = createSupabase({
      existing: [
        {
          id: "obs-1",
          fingerprint,
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
          last_seen_at: "2026-09-14T11:00:00.000Z",
        },
      ],
    });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.opened).toBe(0);
    expect(summary.continuing).toBe(1);
    const [rows] = upsertCalls as [Array<Record<string, unknown>>];
    expect(rows[0].first_seen_at).toBe("2026-09-01T00:00:00.000Z");
    expect(rows[0].last_seen_at).toBe("2026-09-14T12:00:00.000Z");
  });

  it("identifies a finding by code and entity, not by its (mutable) presentation href", async () => {
    // Same code/entity as an existing row, but the href it would display has
    // changed - this must still be treated as the same blocker.
    getOpsNotificationsMock.mockResolvedValue([
      {
        level: "info",
        code: "optimization_inspection_coverage_gap",
        title: "Inspection coverage gap",
        message: "Still open.",
        href: "/inspections/templates?templateId=new-template",
        entityType: "optimization_opportunity",
        entityId: "opp-1",
      },
    ]);

    const fingerprint = "shop::optimization_inspection_coverage_gap::optimization_opportunity::opp-1";
    const { supabase, upsertCalls } = createSupabase({
      existing: [
        {
          id: "obs-9",
          fingerprint,
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
          last_seen_at: "2026-09-14T11:00:00.000Z",
        },
      ],
    });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.opened).toBe(0);
    expect(summary.continuing).toBe(1);
    const [rows] = upsertCalls as [Array<Record<string, unknown>>];
    expect(rows[0].fingerprint).toBe(fingerprint);
  });

  it("excludes tech_underutilized_capacity from the 24/7 scheduled sweep", async () => {
    getOpsNotificationsMock.mockResolvedValue([
      {
        level: "info",
        code: "tech_underutilized_capacity",
        title: "Underutilized technician capacity",
        message: "2 technicians idle.",
        entityType: "shop",
        entityId: "shop-1",
      },
    ]);

    const { supabase, upsertCalls } = createSupabase({ existing: [] });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.observed).toBe(0);
    expect(summary.opened).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("does not resolve a finding that went unseen for less than the grace period", async () => {
    getOpsNotificationsMock.mockResolvedValue([]);

    const { supabase, updateCalls } = createSupabase({
      existing: [
        {
          id: "obs-2",
          fingerprint: "shop::parts_waiting_too_long::work_order::wo-3",
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
          // Only 30 minutes stale - well inside the 2-hour grace period.
          last_seen_at: "2026-09-14T11:30:00.000Z",
        },
      ],
    });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.resolved).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("resolves a finding that has been absent for a full grace period, conditioned on its last-read last_seen_at", async () => {
    getOpsNotificationsMock.mockResolvedValue([]);

    const staleLastSeen = "2026-09-14T09:00:00.000Z"; // 3 hours stale
    const { supabase, updateCalls } = createSupabase({
      existing: [
        {
          id: "obs-2",
          fingerprint: "shop::parts_waiting_too_long::work_order::wo-3",
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
          last_seen_at: staleLastSeen,
        },
      ],
      resolveResponses: [{ data: [{ id: "obs-2" }], error: null }],
    });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const now = new Date("2026-09-14T12:00:00.000Z");
    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now,
    });

    expect(summary.resolved).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({
      status: "resolved",
      resolved_at: now.toISOString(),
    });
    expect(updateCalls[0].eqCalls).toContainEqual(["id", "obs-2"]);
    expect(updateCalls[0].eqCalls).toContainEqual(["shop_id", "shop-1"]);
    expect(updateCalls[0].eqCalls).toContainEqual(["last_seen_at", staleLastSeen]);
  });

  it("does not count a resolve whose optimistic lock lost to a fresher concurrent run", async () => {
    getOpsNotificationsMock.mockResolvedValue([]);

    const { supabase } = createSupabase({
      existing: [
        {
          id: "obs-4",
          fingerprint: "shop::approval_waiting::work_order::wo-5",
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
          last_seen_at: "2026-09-14T09:00:00.000Z",
        },
      ],
      // The row's last_seen_at no longer matches what we read (a fresher
      // run already bumped it), so the conditional update matches nothing.
      resolveResponses: [{ data: [], error: null }],
    });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.resolved).toBe(0);
    expect(summary.errors).toEqual([]);
  });

  it("does not re-resolve a finding that is already resolved", async () => {
    getOpsNotificationsMock.mockResolvedValue([]);

    const { supabase, updateCalls } = createSupabase({
      existing: [
        {
          id: "obs-3",
          fingerprint: "shop::approval_waiting::work_order::wo-4",
          status: "resolved",
          first_seen_at: "2026-09-01T00:00:00.000Z",
          last_seen_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const { syncShopBlockerObservations } = await import(
      "@/features/operations/server/syncShopBlockerObservations"
    );

    const summary = await syncShopBlockerObservations({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.resolved).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });
});
