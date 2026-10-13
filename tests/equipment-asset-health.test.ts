import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  record: vi.fn(),
  evidence: vi.fn(),
}));

vi.mock("@/features/equipment/server/equipmentEvidence", () => ({
  loadEquipmentEvidence: mocks.evidence,
}));

vi.mock("@/features/vehicles/server/loadVehicleWorkspaceSnapshot", () => ({
  loadVehicleWorkspaceSnapshot: mocks.snapshot,
}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  loadEquipmentAssetRecord: mocks.record,
}));

import { loadAssetHealth } from "@/features/equipment/server/loadAssetHealth";

const SHOP = "00000000-0000-4000-8000-000000000111";
const EX = "00000000-0000-4000-8000-000000000001";
const BUCKET = "00000000-0000-4000-8000-000000000002";
const PRIVATE_TOOL = "00000000-0000-4000-8000-000000000003";
const RIPPER = "00000000-0000-4000-8000-000000000004";

type Row = Record<string, unknown>;

function client(rows: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        limit: () => builder,
        is: () => builder,
        order: () => builder,
        range: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: (rows[table] ?? []).filter((row) => filters.every((f) => f(row))),
            error: null,
          }),
      };
      return builder;
    },
  } as never;
}

const admin = client({
  equipment_asset_profiles: [
    { vehicle_id: BUCKET, shop_id: SHOP, equipment_class: "attachment", mounted_on_vehicle_id: EX },
    { vehicle_id: PRIVATE_TOOL, shop_id: SHOP, equipment_class: "attachment", mounted_on_vehicle_id: EX },
    { vehicle_id: RIPPER, shop_id: SHOP, equipment_class: "attachment", mounted_on_vehicle_id: EX },
  ],
});
// The caller's RLS client can see the bucket and ripper but not the private tool.
// Work-order RLS exposes work on the bucket only.
const scoped = client({
  vehicles: [
    { id: BUCKET, shop_id: SHOP, unit_number: "BKT-1", year: null, make: "Cat", model: "Bucket" },
    { id: RIPPER, shop_id: SHOP, unit_number: "RIP-1", year: null, make: "Cat", model: "Ripper" },
  ],
  work_orders: [{ id: "wo-1", shop_id: SHOP, vehicle_id: BUCKET }],
});

describe("loadAssetHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot.mockResolvedValue({ identity: { id: EX } });
    mocks.record.mockResolvedValue({ asset: { id: EX }, profile: null });
    mocks.evidence.mockResolvedValue(new Map([[EX, { latestInspection: null }]]));
  });

  it("returns null when the canonical workspace hides the asset (cross-shop or unassigned mechanic)", async () => {
    mocks.snapshot.mockResolvedValue(null);
    const result = await loadAssetHealth({
      supabase: scoped,
      admin,
      shopId: SHOP,
      role: "mechanic",
      assetId: EX,
    });
    expect(result).toBeNull();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP, role: "mechanic", vehicleId: EX }),
    );
  });

  it("hides unassigned related assets from assigned-work-only mechanics", async () => {
    const result = await loadAssetHealth({
      supabase: scoped,
      admin,
      shopId: SHOP,
      role: "mechanic",
      assetId: EX,
    });
    expect(result?.attachments.map((attachment) => attachment.assetId)).toEqual([BUCKET]);
  });

  it("returns the shared Equipment evidence for the asset", async () => {
    const result = await loadAssetHealth({
      supabase: scoped,
      admin,
      shopId: SHOP,
      role: "owner",
      assetId: EX,
    });
    expect(result?.evidence).toEqual({ latestInspection: null });
    expect(mocks.evidence).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP, assetIds: [EX] }),
    );
  });

  it("reports no Equipment PM plan status when the asset has no active plan", async () => {
    const result = await loadAssetHealth({
      supabase: scoped,
      admin,
      shopId: SHOP,
      role: "owner",
      assetId: EX,
    });
    expect(result?.pmPlans).toBeNull();
  });

  it("lists only attachments the caller can see through RLS", async () => {
    const result = await loadAssetHealth({
      supabase: scoped,
      admin,
      shopId: SHOP,
      role: "owner",
      assetId: EX,
    });
    expect(result?.attachments).toEqual([
      {
        assetId: BUCKET,
        href: `/equipment/${BUCKET}`,
        label: "Unit BKT-1 · Cat Bucket",
        equipmentClassLabel: "Attachment / work tool",
      },
      {
        assetId: RIPPER,
        href: `/equipment/${RIPPER}`,
        label: "Unit RIP-1 · Cat Ripper",
        equipmentClassLabel: "Attachment / work tool",
      },
    ]);
    expect(result?.host).toBeNull();
  });
});

describe("Equipment page access contracts", () => {
  const directory = readFileSync("app/equipment/page.tsx", "utf8");
  const health = readFileSync("app/equipment/[assetId]/page.tsx", "utf8");
  const roles = readFileSync("features/equipment/lib/equipmentDirectory.ts", "utf8");

  it("keeps the shop-wide directory away from assigned-work-only mechanics", () => {
    expect(directory).toContain("allowRoles: EQUIPMENT_DIRECTORY_ROLES");
    const list = roles.slice(roles.indexOf("EQUIPMENT_DIRECTORY_ROLES"), roles.indexOf("] as const"));
    expect(list).not.toContain('"mechanic"');
  });

  it.each([
    ["directory", directory, "loadEquipmentDirectory("],
    ["asset health", health, "loadAssetHealth("],
  ])("checks the Equipment entitlement before loading %s data", (_name, source, loader) => {
    const gate = source.indexOf("resolveEquipmentPageEntitlement(");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(source.indexOf(loader));
    expect(source).toContain('entitlement !== "enabled"');
  });

  it("404s Asset Health for invalid ids and hidden assets", () => {
    expect(health).toContain("if (!isAssetId(assetId)) notFound();");
    expect(health).toContain("if (!health) notFound();");
  });
});
