import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  in: (column: string, values: unknown[]) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  range: (from: number, to: number) => Promise<{ data: Row[]; error: null }>;
  then: (
    resolve: (v: { data: Row[]; error: null }) => unknown,
  ) => unknown;
};

function createQuery(rows: Row[]) {
  const node: QueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn(() => node),
    in: vi.fn(() => node),
    order: vi.fn(() => node),
    range: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return node;
}

function createSupabase(tables: Record<string, Row[]>) {
  return {
    from: vi.fn((table: string) => {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
      return createQuery(tables[table]);
    }),
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
    expect(result.size).toBe(0);
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

    const lines = result.get("mri-1");
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

    expect(result.get("mri-1")?.[0]).toMatchObject({ qtyAvailable: 1, status: "short" });
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

    expect(result.get("mri-1")?.[0]).toMatchObject({
      matchedPartId: null,
      qtyAvailable: null,
      status: "unmatched",
    });
  });

  it("matches a part number regardless of formatting differences", async () => {
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
      parts: [{ id: "part-1", shop_id: "shop-1", part_number: "OF 2200", sku: null, name: "Oil Filter" }],
      part_stock: [{ id: "stock-1", part_id: "part-1", location_id: "loc-1", qty_on_hand: 10, qty_reserved: 0 }],
    });

    const result = await buildPartsReadinessForMenuRepairItems({
      admin: supabase as never,
      shopId: "shop-1",
      menuRepairItemIds: ["mri-1"],
    });

    expect(result.get("mri-1")?.[0]).toMatchObject({ matchedPartId: "part-1", status: "ready" });
  });
});
