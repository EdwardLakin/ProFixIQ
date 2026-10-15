import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const loadEquipmentAssetList = vi.fn();
const loadEquipmentDirectory = vi.fn();
vi.mock("@/features/equipment/server/loadEquipmentAssetList", () => ({
  loadEquipmentAssetList: (input: unknown) => loadEquipmentAssetList(input),
}));
vi.mock("@/features/equipment/server/loadEquipmentDirectory", () => ({
  EQUIPMENT_DIRECTORY_LIMIT: 200,
  loadEquipmentDirectory: (input: unknown) => loadEquipmentDirectory(input),
}));

import type { EquipmentIdentityRow } from "@/features/equipment/lib/equipmentDirectoryQuery";
import { parseDirectoryFilters } from "@/features/equipment/lib/equipmentDirectoryQuery";
import { loadEquipmentDirectoryPage, loadScoredRows } from "@/features/equipment/server/loadEquipmentDirectoryPage";

const env = { supabase: {} as never, admin: {} as never, shopId: "shop", role: "owner" as const };

function identity(n: number, patch: Partial<EquipmentIdentityRow> = {}): EquipmentIdentityRow {
  const id = `asset-${String(n).padStart(4, "0")}`;
  return {
    assetId: id,
    updatedAt: new Date(Date.UTC(2026, 0, 1) - n * 1000).toISOString(),
    unitNumber: `U-${n}`,
    year: null,
    make: "Cat",
    model: "336",
    serialNumber: null,
    equipmentClass: "crawler_excavator",
    equipmentClassLabel: "Crawler excavator",
    customerId: null,
    customerName: null,
    siteName: null,
    operatingStatus: "operational",
    ...patch,
  };
}

/** A scored directory row for the ids asked for; `pmFor` picks the PM state. */
function scoredRows(ids: string[], pmFor: (id: string) => string = () => "ok") {
  return ids.map((assetId) => ({
    assetId,
    pm: { state: pmFor(assetId), dueCount: 0 },
    operatingStatus: "operational",
    openDefects: { total: 0, failed: 0 },
  }));
}

beforeEach(() => {
  loadEquipmentAssetList.mockReset();
  loadEquipmentDirectory.mockReset();
  loadEquipmentDirectory.mockImplementation(async (input: { assetIds: string[] }) => ({
    rows: scoredRows(input.assetIds, (id) => (Number(id.slice(-4)) % 100 === 0 ? "overdue" : "ok")),
    truncated: false,
  }));
});

describe("loadEquipmentDirectoryPage", () => {
  // 450 assets: far past the 200 the first-page directory could ever show.
  const shop = Array.from({ length: 450 }, (_, i) => identity(i + 1));

  it("reaches an asset beyond the first 200 by paging, scoring only that page", async () => {
    loadEquipmentAssetList.mockResolvedValue({ rows: shop, capped: false });
    const page = await loadEquipmentDirectoryPage({ ...env, filters: parseDirectoryFilters({ page: "5" }) });
    expect(page.info).toMatchObject({ page: 5, pageCount: 9, total: 450, from: 201, to: 250 });
    expect(page.rows.map((r) => r.assetId)).toContain("asset-0240");
    expect(page.totalAssets).toBe(450);
    // Only the 50 shown assets were scored, not the shop.
    const scored = loadEquipmentDirectory.mock.calls.flatMap(([call]) => call.assetIds);
    expect(scored).toHaveLength(50);
  });

  it("finds an asset beyond the first 200 by search, scoring only the match", async () => {
    loadEquipmentAssetList.mockResolvedValue({ rows: shop, capped: false });
    const page = await loadEquipmentDirectoryPage({ ...env, filters: parseDirectoryFilters({ q: "U-437" }) });
    expect(page.rows.map((r) => r.assetId)).toEqual(["asset-0437"]);
    expect(page.info.total).toBe(1);
    expect(loadEquipmentDirectory.mock.calls.flatMap(([call]) => call.assetIds)).toEqual(["asset-0437"]);
  });

  it("answers a PM filter from evidence across every match, then pages the result", async () => {
    loadEquipmentAssetList.mockResolvedValue({ rows: shop, capped: false });
    const page = await loadEquipmentDirectoryPage({ ...env, filters: parseDirectoryFilters({ pm: "overdue" }) });
    // Assets 100, 200, 300 and 400 are overdue — three of them past the old 200 cap.
    expect(page.rows.map((r) => r.assetId)).toEqual(["asset-0100", "asset-0200", "asset-0300", "asset-0400"]);
    expect(page.info.total).toBe(4);
    expect(page.evidencePartial).toBe(false);
    // Scored in windows of at most 200, never one giant read.
    expect(loadEquipmentDirectory.mock.calls.every(([call]) => call.assetIds.length <= 200)).toBe(true);
  });

  it("bounds the evidence scan and says so when there are more matches than it covers", async () => {
    const big = Array.from({ length: 2300 }, (_, i) => identity(i + 1));
    loadEquipmentAssetList.mockResolvedValue({ rows: big, capped: false });
    const page = await loadEquipmentDirectoryPage({ ...env, filters: parseDirectoryFilters({ attention: "1" }) });
    expect(page.evidencePartial).toBe(true);
    expect(loadEquipmentDirectory.mock.calls.flatMap(([call]) => call.assetIds)).toHaveLength(2000);
  });

  it("passes identity filters to the index and reports facets for the whole shop", async () => {
    const rows = [
      identity(1, { customerId: "c1", customerName: "Granite", operatingStatus: "down" }),
      identity(2, { customerId: "c2", customerName: "Basalt" }),
    ];
    loadEquipmentAssetList.mockResolvedValue({ rows, capped: true });
    const page = await loadEquipmentDirectoryPage({ ...env, filters: parseDirectoryFilters({ status: "down" }) });
    expect(page.rows.map((r) => r.assetId)).toEqual(["asset-0001"]);
    expect(page.facets.customers).toEqual([["c2", "Basalt"], ["c1", "Granite"]].sort((a, b) => a[1].localeCompare(b[1])));
    expect(page.indexCapped).toBe(true);
  });

  it("returns an empty page when there are no assets", async () => {
    loadEquipmentAssetList.mockResolvedValue({ rows: [], capped: false });
    const page = await loadEquipmentDirectoryPage({ ...env, filters: parseDirectoryFilters({}) });
    expect(page).toMatchObject({ rows: [], totalAssets: 0 });
    expect(loadEquipmentDirectory).not.toHaveBeenCalled();
  });
});

describe("loadScoredRows", () => {
  it("returns rows in the requested order and skips assets with no row", async () => {
    loadEquipmentDirectory.mockImplementation(async (input: { assetIds: string[] }) => ({
      rows: scoredRows(input.assetIds.filter((id) => id !== "hidden").reverse()),
      truncated: false,
    }));
    const rows = await loadScoredRows({ ...env, assetIds: ["b", "hidden", "a"] });
    expect(rows.map((r) => r.assetId)).toEqual(["b", "a"]);
  });
});
