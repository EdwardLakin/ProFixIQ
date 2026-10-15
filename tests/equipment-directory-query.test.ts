import { describe, expect, it } from "vitest";

import type { EquipmentDirectoryRow } from "@/features/equipment/lib/equipmentDirectory";
import {
  DIRECTORY_PAGE_SIZE,
  applyEvidenceFilters,
  applyIdentityFilters,
  directoryFiltersNeedEvidence,
  directoryQueryString,
  identityFacets,
  paginate,
  parseDirectoryFilters,
  type EquipmentDirectoryFilters,
  type EquipmentIdentityRow,
} from "@/features/equipment/lib/equipmentDirectoryQuery";

const NO_FILTERS: EquipmentDirectoryFilters = {
  q: "",
  equipmentClass: "",
  status: "",
  customerId: "",
  pm: "",
  attention: false,
  page: 1,
};

function identity(id: string, patch: Partial<EquipmentIdentityRow> = {}): EquipmentIdentityRow {
  return {
    assetId: id,
    updatedAt: "2026-10-01T00:00:00Z",
    unitNumber: id,
    year: 2021,
    make: "Caterpillar",
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

describe("parseDirectoryFilters", () => {
  it("reads valid params and ignores malformed ones", () => {
    expect(
      parseDirectoryFilters({ q: "  EX-1 ", class: "crawler_excavator", status: "down", customer: "c1", pm: "overdue", attention: "1", page: "3" }),
    ).toEqual({ q: "EX-1", equipmentClass: "crawler_excavator", status: "down", customerId: "c1", pm: "overdue", attention: true, page: 3 });
    expect(parseDirectoryFilters({ status: "bogus", pm: "nope", page: "-4", attention: "yes" })).toEqual(NO_FILTERS);
    expect(parseDirectoryFilters({ page: "abc" }).page).toBe(1);
    expect(parseDirectoryFilters({ q: ["first", "second"] }).q).toBe("first");
    expect(parseDirectoryFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("directoryQueryString", () => {
  it("omits defaults and applies overrides", () => {
    expect(directoryQueryString(NO_FILTERS)).toBe("");
    expect(directoryQueryString({ ...NO_FILTERS, q: "ex 1", status: "down", page: 2 })).toBe("?q=ex+1&status=down&page=2");
    expect(directoryQueryString({ ...NO_FILTERS, page: 4 }, { page: 1 })).toBe("");
    expect(directoryQueryString({ ...NO_FILTERS, attention: true }, { page: 3 })).toBe("?attention=1&page=3");
  });

  it("round-trips through the parser", () => {
    const filters: EquipmentDirectoryFilters = { q: "granite", equipmentClass: "wheel_loader", status: "limited", customerId: "c9", pm: "due", attention: true, page: 7 };
    const params = Object.fromEntries(new URLSearchParams(directoryQueryString(filters)));
    expect(parseDirectoryFilters(params)).toEqual(filters);
  });
});

describe("applyIdentityFilters", () => {
  const rows = [
    identity("EX-1", { customerId: "c1", customerName: "Granite Co", siteName: "North pit", serialNumber: "CAT0336" }),
    identity("WL-2", { equipmentClass: "wheel_loader", equipmentClassLabel: "Wheel loader", make: "Komatsu", model: "WA500", customerId: "c2", customerName: "Basalt Ltd", operatingStatus: "down" }),
  ];

  it("searches unit, make, model, serial, customer, site and class case-insensitively", () => {
    const find = (q: string) => applyIdentityFilters(rows, { ...NO_FILTERS, q }).map((r) => r.assetId);
    expect(find("ex-1")).toEqual(["EX-1"]);
    expect(find("komatsu")).toEqual(["WL-2"]);
    expect(find("wa500")).toEqual(["WL-2"]);
    expect(find("cat0336")).toEqual(["EX-1"]);
    expect(find("GRANITE")).toEqual(["EX-1"]);
    expect(find("north pit")).toEqual(["EX-1"]);
    expect(find("wheel loader")).toEqual(["WL-2"]);
    expect(find("nothing")).toEqual([]);
  });

  it("filters by class, status and customer", () => {
    expect(applyIdentityFilters(rows, { ...NO_FILTERS, equipmentClass: "wheel_loader" }).map((r) => r.assetId)).toEqual(["WL-2"]);
    expect(applyIdentityFilters(rows, { ...NO_FILTERS, status: "down" }).map((r) => r.assetId)).toEqual(["WL-2"]);
    expect(applyIdentityFilters(rows, { ...NO_FILTERS, customerId: "c1" }).map((r) => r.assetId)).toEqual(["EX-1"]);
  });
});

describe("applyEvidenceFilters", () => {
  const row = (id: string, pm: string, extra: Partial<EquipmentDirectoryRow> = {}) =>
    ({ assetId: id, pm: { state: pm, dueCount: 0 }, operatingStatus: "operational", openDefects: { total: 0, failed: 0 }, ...extra }) as EquipmentDirectoryRow;

  it("filters by PM state and by the needs-attention rule", () => {
    const rows = [row("a", "overdue"), row("b", "ok"), row("c", "ok", { operatingStatus: "down" }), row("d", "not_evaluated")];
    expect(applyEvidenceFilters(rows, { pm: "overdue", attention: false }).map((r) => r.assetId)).toEqual(["a"]);
    expect(applyEvidenceFilters(rows, { pm: "", attention: true }).map((r) => r.assetId)).toEqual(["a", "c"]);
    expect(applyEvidenceFilters(rows, { pm: "ok", attention: true }).map((r) => r.assetId)).toEqual(["c"]);
  });

  it("reports which filters need evidence", () => {
    expect(directoryFiltersNeedEvidence(NO_FILTERS)).toBe(false);
    expect(directoryFiltersNeedEvidence({ ...NO_FILTERS, q: "x", status: "down" })).toBe(false);
    expect(directoryFiltersNeedEvidence({ ...NO_FILTERS, pm: "due" })).toBe(true);
    expect(directoryFiltersNeedEvidence({ ...NO_FILTERS, attention: true })).toBe(true);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 120 }, (_, i) => i + 1);

  it("pages by the page size and reports the range", () => {
    const second = paginate(items, 2);
    expect(second.items[0]).toBe(DIRECTORY_PAGE_SIZE + 1);
    expect(second.items).toHaveLength(DIRECTORY_PAGE_SIZE);
    expect(second.info).toEqual({ page: 2, pageCount: 3, total: 120, from: 51, to: 100 });
    expect(paginate(items, 3).items).toHaveLength(20);
  });

  it("clamps out-of-range pages and handles empty lists", () => {
    expect(paginate(items, 99).info.page).toBe(3);
    expect(paginate(items, 0).info.page).toBe(1);
    expect(paginate([], 1)).toEqual({ items: [], info: { page: 1, pageCount: 1, total: 0, from: 0, to: 0 } });
  });
});

describe("identityFacets", () => {
  it("lists distinct classes and customers across the whole shop, sorted by label", () => {
    const facets = identityFacets([
      identity("a", { customerId: "c2", customerName: "Zinc" }),
      identity("b", { equipmentClass: "wheel_loader", equipmentClassLabel: "Wheel loader", customerId: "c1", customerName: "Alpha" }),
      identity("c", { customerId: "c1", customerName: "Alpha" }),
      identity("d"),
    ]);
    expect(facets.classes).toEqual([["crawler_excavator", "Crawler excavator"], ["wheel_loader", "Wheel loader"]]);
    expect(facets.customers).toEqual([["c1", "Alpha"], ["c2", "Zinc"]]);
  });
});
