import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@shared/types/types/supabase";
import {
  listFieldInvoiceHistory,
  type FieldInvoiceHistoryScope,
} from "./fieldInvoiceHistory";

type QueryRow = Record<string, unknown>;

type QueryRecord = {
  table: string;
  select: string;
  ranges: Array<[number, number]>;
  inFilters: Map<string, readonly unknown[]>;
};

function fakeSupabase(args: {
  workOrders: QueryRow[];
  versions: QueryRow[];
  fail?: (table: string, from: number) => string | null;
}) {
  const records: QueryRecord[] = [];
  let fromCalls = 0;

  const from = (table: string) => {
    fromCalls += 1;
    const equals = new Map<string, unknown>();
    const inFilters = new Map<string, readonly unknown[]>();
    const record: QueryRecord = {
      table,
      select: "",
      ranges: [],
      inFilters,
    };
    records.push(record);

    const builder = {
      select(columns: string) {
        record.select = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        equals.set(column, value);
        return builder;
      },
      in(column: string, values: readonly unknown[]) {
        inFilters.set(column, values);
        return builder;
      },
      order() {
        return builder;
      },
      async range(rangeFrom: number, rangeTo: number) {
        record.ranges.push([rangeFrom, rangeTo]);
        const failure = args.fail?.(table, rangeFrom);
        if (failure) return { data: null, error: { message: failure } };

        let rows = table === "work_orders" ? args.workOrders : args.versions;
        for (const [column, value] of equals) {
          rows = rows.filter((row) => row[column] === value);
        }
        for (const [column, values] of inFilters) {
          const accepted = new Set(values);
          rows = rows.filter((row) => accepted.has(row[column]));
        }
        return {
          data: rows.slice(rangeFrom, rangeTo + 1),
          error: null,
        };
      },
    };

    return builder;
  };

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    records,
    get fromCalls() {
      return fromCalls;
    },
  };
}

function historyFixture(size: number) {
  const workOrders = Array.from({ length: size }, (_, index) => {
    const id = `wo-${String(index).padStart(4, "0")}`;
    return {
      id,
      shop_id: "shop-1",
      status: "invoiced",
      custom_id: `RO-${index}`,
      updated_at: "2026-08-18T12:00:00.000Z",
      paid_at: index === size - 1 ? null : "2026-08-18T13:00:00.000Z",
      customers: {
        first_name: "Jamie",
        last_name: "Smith",
        email: "jamie@example.com",
      },
      vehicles: {
        year: 2024,
        make: "Ford",
        model: "F-550",
        license_plate: "FIELD1",
      },
    };
  });
  const versions = workOrders.map((workOrder, index) => ({
    id: `version-${String(index).padStart(4, "0")}`,
    shop_id: "shop-1",
    work_order_id: workOrder.id,
    version_number: 1,
    lifecycle_status: index === size - 1 ? "issued" : "paid",
    currency: "CAD",
    total: 500,
    paid_total: index === size - 1 ? 475 : 500,
    refunded_total: 0,
    outstanding_total: index === size - 1 ? 25 : 0,
    issued_at: "2026-08-18T12:00:00.000Z",
    created_at: "2026-08-18T12:00:00.000Z",
    invoices: { invoice_number: `INV-${index}` },
  }));
  return { workOrders, versions };
}

async function load(
  fixture: ReturnType<typeof historyFixture>,
  scope: FieldInvoiceHistoryScope = { kind: "shop" },
) {
  const fake = fakeSupabase(fixture);
  const rows = await listFieldInvoiceHistory({
    supabase: fake.client,
    shopId: "shop-1",
    scope,
  });
  return { fake, rows };
}

describe("listFieldInvoiceHistory", () => {
  it("keeps an old unpaid invoice beyond the first work-order page", async () => {
    const { fake, rows } = await load(historyFixture(501));

    expect(rows).toHaveLength(501);
    expect(rows.find((row) => row.workOrderId === "wo-0500")).toMatchObject({
      paymentState: "unpaid",
      outstandingTotal: 25,
    });
    expect(
      fake.records
        .filter((record) => record.table === "work_orders")
        .flatMap((record) => record.ranges),
    ).toEqual([
      [0, 499],
      [500, 999],
      [501, 1000],
    ]);
    expect(
      fake.records.find((record) => record.table === "invoice_versions")
        ?.select,
    ).toContain(
      "invoices:invoices!invoice_versions_invoice_id_fkey(invoice_number)",
    );
  });

  it("paginates every active invoice version before choosing the latest one", async () => {
    const fixture = historyFixture(1);
    fixture.versions = Array.from({ length: 501 }, (_, index) => ({
      ...fixture.versions[0],
      id: `version-${String(index).padStart(4, "0")}`,
      version_number: index + 1,
      outstanding_total: index === 500 ? 30 : 500,
      invoices: { invoice_number: `INV-${index}` },
    }));

    const { fake, rows } = await load(fixture);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      versionNumber: 501,
      invoiceNumber: "INV-500",
      outstandingTotal: 30,
    });
    expect(
      fake.records
        .filter((record) => record.table === "invoice_versions")
        .flatMap((record) => record.ranges),
    ).toEqual([
      [0, 499],
      [500, 999],
      [501, 1000],
    ]);
  });

  it("fails closed for an empty assigned scope and filters a populated one", async () => {
    const fixture = historyFixture(2);
    const empty = fakeSupabase(fixture);

    await expect(
      listFieldInvoiceHistory({
        supabase: empty.client,
        shopId: "shop-1",
        scope: { kind: "work_orders", ids: [] },
      }),
    ).resolves.toEqual([]);
    expect(empty.fromCalls).toBe(0);

    const { fake, rows } = await load(fixture, {
      kind: "work_orders",
      ids: ["wo-0001", "wo-0001"],
    });
    expect(rows.map((row) => row.workOrderId)).toEqual(["wo-0001"]);
    expect(
      fake.records
        .find((record) => record.table === "work_orders")
        ?.inFilters.get("id"),
    ).toEqual(["wo-0001"]);
  });

  it("rejects a later-page failure instead of returning partial financial data", async () => {
    const fixture = historyFixture(501);
    const fake = fakeSupabase({
      ...fixture,
      fail: (table, from) =>
        table === "work_orders" && from === 500 ? "second page failed" : null,
    });

    await expect(
      listFieldInvoiceHistory({
        supabase: fake.client,
        shopId: "shop-1",
        scope: { kind: "shop" },
      }),
    ).rejects.toThrow("second page failed");
  });
});
