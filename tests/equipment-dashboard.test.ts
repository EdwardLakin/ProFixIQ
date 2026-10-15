import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const loadEquipmentDirectory = vi.fn();
vi.mock("@/features/equipment/server/loadEquipmentDirectory", () => ({
  EQUIPMENT_DIRECTORY_LIMIT: 200,
  loadEquipmentDirectory: (input: unknown) => loadEquipmentDirectory(input),
}));

import {
  DASHBOARD_ATTENTION_LIMIT,
  accumulateFleetSummary,
  emptyFleetSummary,
  equipmentAttentionReasons,
} from "@/features/equipment/lib/equipmentDashboard";
import type { EquipmentDirectoryRow } from "@/features/equipment/lib/equipmentDirectory";
import { loadEquipmentFleetSummary } from "@/features/equipment/server/loadEquipmentFleetSummary";

const NOW = new Date("2026-10-12T12:00:00Z");

function row(id: string, patch: Partial<EquipmentDirectoryRow> = {}): EquipmentDirectoryRow {
  return {
    assetId: id,
    href: `/equipment/${id}`,
    unitNumber: id,
    year: null,
    make: null,
    model: null,
    equipmentClass: "crawler_excavator",
    equipmentClassLabel: "Crawler excavator",
    serialNumber: null,
    primaryMeter: "hours",
    engineHours: null,
    odometer: null,
    odometerUnit: null,
    currentCycles: null,
    customerId: null,
    customerName: null,
    siteName: null,
    operatingStatus: "operational",
    openDefects: { total: 0, failed: 0 },
    pm: { state: "ok", dueCount: 0 },
    openWorkOrderCount: 0,
    inspection: { state: "clear", recordedAt: null },
    actions: { createWorkOrderHref: null, recordMeterHref: null },
    lastServiceAt: null,
    nextService: null,
    activeWorkOrder: null,
    mountedOnAssetId: null,
    ...patch,
  } as EquipmentDirectoryRow;
}

describe("accumulateFleetSummary", () => {
  it("counts status, PM, inspections, open work and upcoming service from directory rows", () => {
    const summary = accumulateFleetSummary(
      emptyFleetSummary(),
      [
        row("a", { pm: { state: "overdue", dueCount: 2 }, openWorkOrderCount: 2, nextService: { startsAt: "2026-10-15T08:00:00Z", status: "scheduled" } }),
        row("b", { operatingStatus: "down", inspection: { state: "findings", recordedAt: null }, openDefects: { total: 3, failed: 1 } }),
        row("c", { pm: { state: "not_evaluated", dueCount: 0 }, inspection: { state: "none", recordedAt: null }, nextService: { startsAt: "2026-11-30T08:00:00Z", status: "scheduled" } }),
        row("d", { operatingStatus: "retired", pm: { state: "due", dueCount: 1 } }),
      ],
      NOW,
    );
    expect(summary).toMatchObject({
      total: 4,
      partial: false,
      pm: { overdue: 1, due: 1, ok: 1, not_evaluated: 1 },
      inspection: { none: 1, clear: 2, findings: 1, failed: 1 },
      openWork: { assets: 1, orders: 2 },
      upcomingService: 1,
    });
    expect(summary.status).toMatchObject({ operational: 2, down: 1, retired: 1 });
  });

  it("counts a machine as needing attention exactly when the directory filter does", () => {
    const summary = accumulateFleetSummary(
      emptyFleetSummary(),
      [
        row("ok"),
        row("overdue", { pm: { state: "overdue", dueCount: 1 } }),
        row("due", { pm: { state: "due", dueCount: 1 } }),
        row("down", { operatingStatus: "out_of_service" }),
        row("failed", { openDefects: { total: 1, failed: 1 } }),
        row("unevaluated", { pm: { state: "not_evaluated", dueCount: 0 } }),
      ],
      NOW,
    );
    expect(summary.needsAttention).toBe(4);
    expect(summary.attention.map((item) => item.assetId)).not.toContain("ok");
    expect(summary.attention.map((item) => item.assetId)).not.toContain("unevaluated");
  });

  it("keeps only the most urgent attention items across batches", () => {
    const summary = emptyFleetSummary();
    accumulateFleetSummary(summary, Array.from({ length: 15 }, (_, i) => row(`due-${i}`, { pm: { state: "due", dueCount: 1 } })), NOW);
    accumulateFleetSummary(summary, [row("down-and-overdue", { operatingStatus: "down", pm: { state: "overdue", dueCount: 1 } })], NOW);
    expect(summary.needsAttention).toBe(16);
    expect(summary.attention).toHaveLength(DASHBOARD_ATTENTION_LIMIT);
    expect(summary.attention[0]).toMatchObject({
      assetId: "down-and-overdue",
      reasons: ["Down", "PM overdue"],
    });
  });

  it("explains each reason once and pluralises failed findings", () => {
    expect(
      equipmentAttentionReasons({
        pm: { state: "due", dueCount: 1 },
        operatingStatus: "operational",
        openDefects: { total: 3, failed: 2 },
      }).reasons,
    ).toEqual(["PM due", "2 failed findings"]);
  });
});

describe("loadEquipmentFleetSummary", () => {
  const env = { supabase: {} as never, admin: {} as never, shopId: "shop", role: "owner" as const, now: NOW };

  it("walks every window of the shop until the directory stops truncating", async () => {
    loadEquipmentDirectory.mockReset();
    loadEquipmentDirectory
      .mockResolvedValueOnce({ rows: [row("a"), row("b")], truncated: true })
      .mockResolvedValueOnce({ rows: [row("c", { pm: { state: "overdue", dueCount: 1 } })], truncated: false });
    const summary = await loadEquipmentFleetSummary(env);
    expect(loadEquipmentDirectory.mock.calls.map(([call]) => call.window)).toEqual([
      { offset: 0, limit: 200 },
      { offset: 200, limit: 200 },
    ]);
    // Counts cover assets beyond the first 200 — the whole point of the dashboard.
    expect(summary).toMatchObject({ total: 3, partial: false, pm: { overdue: 1, ok: 2 } });
  });

  it("reports a partial summary when the shop is larger than the scan limit", async () => {
    loadEquipmentDirectory.mockReset();
    loadEquipmentDirectory.mockResolvedValue({ rows: [row("a")], truncated: true });
    const summary = await loadEquipmentFleetSummary({ ...env, maxAssets: 400 });
    expect(loadEquipmentDirectory).toHaveBeenCalledTimes(2);
    expect(summary.partial).toBe(true);
    expect(summary.total).toBe(2);
  });

  it("makes a single read for a small shop", async () => {
    loadEquipmentDirectory.mockReset();
    loadEquipmentDirectory.mockResolvedValue({ rows: [], truncated: false });
    const summary = await loadEquipmentFleetSummary(env);
    expect(loadEquipmentDirectory).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ total: 0, partial: false });
  });
});
