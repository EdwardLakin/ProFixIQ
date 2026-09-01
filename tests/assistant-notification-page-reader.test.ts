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
    limit: number | null;
    selectOptions: unknown;
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
        limit: null as number | null,
        selectOptions: null as unknown,
      };
      queries.push(tracked);

      const builder: Record<string, unknown> = {};
      builder.select = (_columns: string, options?: unknown) => {
        tracked.selectOptions = options ?? null;
        return builder;
      };
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
      builder.limit = (value: number) => {
        tracked.limit = value;
        return builder;
      };
      builder.or = (value: string) => {
        tracked.filters.push({ method: "or", column: "", value });
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

function notificationId(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

describe("assistant notification page reader", () => {
  it("uses a composite cursor and merges disjoint shop scopes deterministically", async () => {
    const firstCursor = {
      lastSeenAt: "2026-09-01T00:00:00.000Z",
      id: notificationId(2),
    };
    const { client, queries } = createQueryClient([
      {
        data: [row(notificationId(3)), row(notificationId(1))],
        error: null,
        count: 2,
      },
      {
        data: [row(notificationId(2)), row(notificationId(0))],
        error: null,
        count: 2,
      },
    ]);

    const page = await readAssistantNotificationPage({
      supabase: client as never,
      scopes: [
        { shopId: "shop-a", fleetIds: ["fleet-a"] },
        { shopId: "shop-b", fleetIds: ["fleet-b"] },
      ],
      source: "fleet",
      statuses: ["active", "acknowledged"],
      cursor: null,
      pageSize: 2,
    });

    expect(page.rows.map((item) => item.id)).toEqual([
      notificationId(3),
      notificationId(2),
    ]);
    expect(page).toMatchObject({
      total: 4,
      nextCursor: firstCursor,
      available: true,
    });
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
    expect(queries[0]?.limit).toBe(3);
    expect(queries[1]?.limit).toBe(3);
    expect(queries[0]?.selectOptions).toEqual({ count: "exact" });
    expect(queries[1]?.selectOptions).toEqual({ count: "exact" });
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

    const next = createQueryClient([
      { data: [row(notificationId(1))], error: null, count: null },
      { data: [row(notificationId(0))], error: null, count: null },
    ]);
    const nextPage = await readAssistantNotificationPage({
      supabase: next.client as never,
      scopes: [
        { shopId: "shop-a", fleetIds: ["fleet-a"] },
        { shopId: "shop-b", fleetIds: ["fleet-b"] },
      ],
      source: "fleet",
      statuses: ["active", "acknowledged"],
      cursor: firstCursor,
      pageSize: 2,
    });

    expect(nextPage.rows.map((item) => item.id)).toEqual([
      notificationId(1),
      notificationId(0),
    ]);
    expect(nextPage.total).toBeNull();
    expect(nextPage.nextCursor).toBeNull();
    expect(next.queries[0]?.filters).toContainEqual({
      method: "or",
      column: "",
      value: `last_seen_at.lt.${firstCursor.lastSeenAt},and(last_seen_at.eq.${firstCursor.lastSeenAt},id.lt.${firstCursor.id})`,
    });
    expect(next.queries[1]?.filters).toContainEqual({
      method: "or",
      column: "",
      value: `last_seen_at.lt.${firstCursor.lastSeenAt},and(last_seen_at.eq.${firstCursor.lastSeenAt},id.lt.${firstCursor.id})`,
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
        cursor: null,
        pageSize: 50,
      }),
    ).resolves.toEqual({
      available: false,
      rows: [],
      total: 0,
      nextCursor: null,
    });
  });

  it("keeps deep continuation work bounded to one page query per scope", async () => {
    const cursor = {
      lastSeenAt: "2026-09-01T00:00:00.000Z",
      id: notificationId(2000),
    };
    const rows = Array.from({ length: 51 }, (_, index) =>
      row(notificationId(1000 - index)),
    );
    const { client, queries } = createQueryClient([
      { data: rows, error: null, count: null },
    ]);

    const page = await readAssistantNotificationPage({
      supabase: client as never,
      scopes: [{ shopId: "shop-a", fleetIds: ["fleet-a"] }],
      source: "fleet",
      statuses: ["active"],
      cursor,
      pageSize: 50,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.limit).toBe(51);
    expect(queries[0]?.filters).toContainEqual({
      method: "or",
      column: "",
      value: `last_seen_at.lt.${cursor.lastSeenAt},and(last_seen_at.eq.${cursor.lastSeenAt},id.lt.${cursor.id})`,
    });
    expect(page.rows).toHaveLength(50);
    expect(page).toMatchObject({
      total: null,
      nextCursor: {
        lastSeenAt: "2026-09-01T00:00:00.000Z",
        id: notificationId(951),
      },
    });
  });
});
