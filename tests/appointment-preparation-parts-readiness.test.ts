import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  in: (column: string, values: unknown[]) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  range: (from: number, to: number) => Promise<{ data: Row[]; error: null }>;
};

/** A faithful-enough double: eq/in actually filter, like real PostgREST. */
function createQuery(allRows: Row[], calls: { inCalls: number }) {
  let rows = allRows;
  const node: QueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return node;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      calls.inCalls += 1;
      rows = rows.filter((row) => values.includes(row[column]));
      return node;
    }),
    order: vi.fn(() => node),
    range: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return node;
}

function createSupabase(tables: Record<string, Row[]>) {
  const inCallsByTable: Record<string, { inCalls: number }> = {};
  return {
    from: vi.fn((table: string) => {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
      inCallsByTable[table] ??= { inCalls: 0 };
      return createQuery(tables[table], inCallsByTable[table]);
    }),
    __inCallsByTable: inCallsByTable,
  };
}

describe("buildPartsReadinessForMenuRepairItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map when no menu repair items are requested", async () => {
    const { buildPartsReadinessForMenuRepairItems } = await import(
      "@/features/operations/server/appointmentPreparation/buildPartsReadiness"
    );
    const supabase = createSupabase({});
    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: [],
    });
    expect(result.error).toBeNull();
    expect(result.readinessByMenuRepairItemId.size).toBe(0);
  });

  it("marks a required part ready when on-hand minus reserved covers the required qty", async () => {
    const { buildPartsReadinessForMenuRepairItems } = await import(
      "@/features/operations/server/appointmentPreparation/buildPartsReadiness"
    );
    const supabase = createSupabase({
      menu_repair_item_parts: [
        {
          id: "mip-1",
          menu_repair_item_id: "mri-1",
          part_name: "Front Brake Pads",
          part_number: "BP-100",
          qty: 1,
          is_required: true,
          shop_id: "shop-1",
        },
      ],
      parts: [
        { id: "part-1", shop_id: "shop-1", part_number: "BP-100", sku: "SKU-BP100", name: "Brake Pads" },
      ],
      part_stock: [
        { id: "stock-1", part_id: "part-1", location_id: "loc-1", qty_on_hand: 5, qty_reserved: 1 },
      ],
    });

    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: ["mri-1"],
    });

    const lines = result.readinessByMenuRepairItemId.get("mri-1");
    expect(lines).toHaveLength(1);
    expect(lines?.[0]).toMatchObject({
      partNumber: "BP-100",
      qtyRequired: 1,
      matchedPartId: "part-1",
      qtyAvailable: 4,
      status: "ready",
    });
  });

  it("marks a part short when required qty exceeds available stock", async () => {
    const { buildPartsReadinessForMenuRepairItems } = await import(
      "@/features/operations/server/appointmentPreparation/buildPartsReadiness"
    );
    const supabase = createSupabase({
      menu_repair_item_parts: [
        {
          id: "mip-1",
          menu_repair_item_id: "mri-1",
          part_name: "Alternator",
          part_number: "ALT-9",
          qty: 2,
          is_required: true,
          shop_id: "shop-1",
        },
      ],
      parts: [{ id: "part-1", shop_id: "shop-1", part_number: "ALT-9", sku: null, name: "Alternator" }],
      part_stock: [{ id: "stock-1", part_id: "part-1", location_id: "loc-1", qty_on_hand: 1, qty_reserved: 0 }],
    });

    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: ["mri-1"],
    });

    expect(result.readinessByMenuRepairItemId.get("mri-1")?.[0]).toMatchObject({
      qtyAvailable: 1,
      status: "short",
    });
  });

  it("marks a part unmatched when it does not exist in the shop's part catalog", async () => {
    const { buildPartsReadinessForMenuRepairItems } = await import(
      "@/features/operations/server/appointmentPreparation/buildPartsReadiness"
    );
    const supabase = createSupabase({
      menu_repair_item_parts: [
        {
          id: "mip-1",
          menu_repair_item_id: "mri-1",
          part_name: "Mystery Part",
          part_number: "ZZZ-1",
          qty: 1,
          is_required: true,
          shop_id: "shop-1",
        },
      ],
      parts: [],
      part_stock: [],
    });

    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: ["mri-1"],
    });

    expect(result.readinessByMenuRepairItemId.get("mri-1")?.[0]).toMatchObject({
      matchedPartId: null,
      qtyAvailable: null,
      status: "unmatched",
    });
  });

  it("matches a part number regardless of formatting differences, via in-memory normalization rather than a raw-text DB filter", async () => {
    const { buildPartsReadinessForMenuRepairItems } = await import(
      "@/features/operations/server/appointmentPreparation/buildPartsReadiness"
    );
    const supabase = createSupabase({
      menu_repair_item_parts: [
        {
          id: "mip-1",
          menu_repair_item_id: "mri-1",
          part_name: "Oil Filter",
          part_number: "of-2200",
          qty: 1,
          is_required: false,
          shop_id: "shop-1",
        },
      ],
      // The catalog row's formatting deliberately does not equal the
      // requested part_number under raw string equality - only under
      // normalizePartNumber. The mock's `.in`/`.eq` genuinely filter (they
      // are not no-ops), so a raw-text `.in("part_number", [...])` query
      // would legitimately find nothing here.
      parts: [{ id: "part-1", shop_id: "shop-1", part_number: "OF 2200", sku: null, name: "Oil Filter" }],
      part_stock: [{ id: "stock-1", part_id: "part-1", location_id: "loc-1", qty_on_hand: 10, qty_reserved: 0 }],
    });

    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: ["mri-1"],
    });

    expect(result.readinessByMenuRepairItemId.get("mri-1")?.[0]).toMatchObject({
      matchedPartId: "part-1",
      status: "ready",
    });
    // The parts catalog is scanned wholesale (eq shop_id only) rather than
    // filtered by a raw-text .in() that formatting differences would defeat.
    expect(
      (supabase as unknown as { __inCallsByTable: Record<string, { inCalls: number }> })
        .__inCallsByTable.parts?.inCalls,
    ).toBe(0);
  });

  it("propagates a parts-catalog query failure instead of treating it as an empty catalog", async () => {
    const { buildPartsReadinessForMenuRepairItems } = await import(
      "@/features/operations/server/appointmentPreparation/buildPartsReadiness"
    );
    const partsQuery = {
      select: vi.fn(function (this: unknown) {
        return this;
      }),
      eq: vi.fn(function (this: unknown) {
        return this;
      }),
      order: vi.fn(function (this: unknown) {
        return this;
      }),
      range: vi.fn(() => Promise.resolve({ data: null, error: { message: "parts unavailable" } })),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "menu_repair_item_parts") {
          return createQuery(
            [
              {
                id: "mip-1",
                menu_repair_item_id: "mri-1",
                part_name: "Alternator",
                part_number: "ALT-9",
                qty: 1,
                is_required: true,
                shop_id: "shop-1",
              },
            ],
            { inCalls: 0 },
          );
        }
        if (table === "parts") return partsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: ["mri-1"],
    });

    expect(result.error).toBe("parts unavailable");
    expect(result.readinessByMenuRepairItemId.size).toBe(0);
  });
});
