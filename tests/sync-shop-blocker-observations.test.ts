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
};

function createSupabase(input: { existing: ExistingRow[] }) {
  const upsertCalls: unknown[] = [];
  const updateCalls: Array<{
    payload: Record<string, unknown>;
    shopId?: string;
    ids?: string[];
  }> = [];

  const selectQuery = {
    eq: vi.fn(() => Promise.resolve({ data: input.existing, error: null })),
  };

  type UpdateBuilder = {
    eq: (col: string, value: string) => UpdateBuilder;
    in: (
      col: string,
      ids: string[],
    ) => Promise<{ error: null }>;
  };

  function makeUpdateBuilder(payload: Record<string, unknown>): UpdateBuilder {
    let shopId: string | undefined;
    const builder: UpdateBuilder = {
      eq: vi.fn((_col: string, value: string) => {
        shopId = value;
        return builder;
      }),
      in: vi.fn((_col: string, ids: string[]) => {
        updateCalls.push({ payload, shopId, ids });
        return Promise.resolve({ error: null });
      }),
    };
    return builder;
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

  it("opens a new finding with a fresh first_seen_at and a reason snapshot", async () => {
    getOpsNotificationsMock.mockResolvedValue([
      {
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "WO waiting too long",
        message: "WO #A100 has been queued for 8 hours.",
        href: "/work-orders/wo-1",
        entityType: "work_order",
        entityId: "wo-1",
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

    const fingerprint = "shop::approval_waiting::work_order::wo-2::na";
    const { supabase, upsertCalls } = createSupabase({
      existing: [
        {
          id: "obs-1",
          fingerprint,
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
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

  it("resolves a previously active finding that no longer fires", async () => {
    getOpsNotificationsMock.mockResolvedValue([]);

    const { supabase, updateCalls } = createSupabase({
      existing: [
        {
          id: "obs-2",
          fingerprint: "shop::parts_waiting_too_long::work_order::wo-3::na",
          status: "active",
          first_seen_at: "2026-09-01T00:00:00.000Z",
        },
      ],
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
    expect(updateCalls[0].shopId).toBe("shop-1");
    expect(updateCalls[0].ids).toEqual(["obs-2"]);
  });

  it("does not re-resolve a finding that is already resolved", async () => {
    getOpsNotificationsMock.mockResolvedValue([]);

    const { supabase, updateCalls } = createSupabase({
      existing: [
        {
          id: "obs-3",
          fingerprint: "shop::approval_waiting::work_order::wo-4::na",
          status: "resolved",
          first_seen_at: "2026-09-01T00:00:00.000Z",
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
