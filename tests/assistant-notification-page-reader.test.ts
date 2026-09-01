import { describe, expect, it, vi } from "vitest";

import { readAssistantNotificationPage } from "@/features/agent/server/syncAssistantNotifications";

type QueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message: string; details?: string } | null;
  count: number | null;
};

function createQueryClient(results: QueryResult[]) {
  const queries: Array<{
    filters: Array<{ method: string; column: string; value: unknown }>;
    orders: Array<{ column: string; options: unknown }>;
    range: { from: number; to: number } | null;
  }> = [];
  let resultIndex = 0;

  const client = {
    from: vi.fn(() => {
      const tracked = {
        filters: [] as Array<{
          method: string;
          column: string;
          value: unknown;
        }>,
        orders: [] as Array<{ column: string; options: unknown }>,
        range: null as { from: number; to: number } | null,
      };
      queries.push(tracked);

      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        tracked.filters.push({ method: "eq", column, value });
        return builder;
      };
      builder.in = (column: string, value: unknown) => {
        tracked.filters.push({ method: "in", column, value });
        return builder;
      };
      builder.order = (column: string, options: unknown) => {
        tracked.orders.push({ column, options });
        return builder;
      };
      builder.range = (from: number, to: number) => {
        tracked.range = { from, to };
        return builder;
      };
      builder.then = (resolve: (value: QueryResult) => unknown) =>
        Promise.resolve(results[resultIndex++]).then(resolve);
      return builder;
    }),
  };

  return { client, queries };
}

function row(id: string) {
  return {
    id,
    level: "warning",
    code: "fleet_pretrip_missing",
    title: "Missed pre-trip",
    message: "Needs review",
    href: "/fleet?focus=defects",
    entity_type: "fleet_pretrip_report",
    entity_id: id,
    status: "active",
    metadata: {},
    last_seen_at: "2026-09-01T00:00:00.000Z",
  };
}

describe("assistant notification page reader", () => {
  it("uses a unique tie-breaker and merges disjoint shop scopes deterministically", async () => {
    const { client, queries } = createQueryClient([
      { data: [row("0003"), row("0001")], error: null, count: 2 },
      { data: [row("0002"), row("0000")], error: null, count: 2 },
    ]);

    const page = await readAssistantNotificationPage({
      supabase: client as never,
      scopes: [
        { shopId: "shop-a", fleetIds: ["fleet-a"] },
        { shopId: "shop-b", fleetIds: ["fleet-b"] },
      ],
      source: "fleet",
      statuses: ["active", "acknowledged"],
      offset: 1,
      pageSize: 2,
    });

    expect(page.rows.map((item) => item.id)).toEqual(["0002", "0001"]);
    expect(page).toMatchObject({ total: 4, nextOffset: 3, available: true });
    expect(queries.map((query) => query.orders)).toEqual([
      [
        { column: "last_seen_at", options: { ascending: false } },
        { column: "id", options: { ascending: false } },
      ],
      [
        { column: "last_seen_at", options: { ascending: false } },
        { column: "id", options: { ascending: false } },
      ],
    ]);
    expect(queries.map((query) => query.range)).toEqual([
      { from: 0, to: 2 },
      { from: 0, to: 2 },
    ]);
    expect(queries[0]?.filters).toContainEqual({
      method: "in",
      column: "metadata->>fleet_id",
      value: ["fleet-a"],
    });
    expect(queries[1]?.filters).toContainEqual({
      method: "in",
      column: "metadata->>fleet_id",
      value: ["fleet-b"],
    });
  });

  it("reports the production-only relation as unavailable on clean replay", async () => {
    const { client } = createQueryClient([
      {
        data: null,
        error: {
          code: "PGRST205",
          message: "Could not find assistant_notifications in the schema cache",
        },
        count: null,
      },
    ]);

    await expect(
      readAssistantNotificationPage({
        supabase: client as never,
        scopes: [{ shopId: "shop-a", fleetIds: ["fleet-a"] }],
        source: "fleet",
        statuses: ["active"],
        offset: 0,
        pageSize: 50,
      }),
    ).resolves.toEqual({
      available: false,
      rows: [],
      total: 0,
      nextOffset: null,
    });
  });
});
