import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DASHBOARD_ATTENTION_LIMIT,
  accumulateFleetSummary,
  emptyFleetSummary,
  equipmentAttentionReasons,
  type FleetSignalRow,
} from "@/features/equipment/lib/equipmentDashboard";

const NOW = new Date("2026-10-12T12:00:00Z");

function row(id: string, patch: Partial<FleetSignalRow> = {}): FleetSignalRow {
  return {
    assetId: id,
    href: `/equipment/${id}`,
    unitNumber: id,
    year: null,
    make: null,
    model: null,
    operatingStatus: "operational",
    openDefects: { total: 0, failed: 0 },
    pm: { state: "ok" },
    openWorkOrderCount: 0,
    inspection: { state: "clear", recordedAt: null },
    nextService: null,
    ...patch,
  };
}

describe("accumulateFleetSummary", () => {
  it("counts status, PM, inspections, open work and upcoming service from directory rows", () => {
    const summary = accumulateFleetSummary(
      emptyFleetSummary(),
      [
        row("a", { pm: { state: "overdue" }, openWorkOrderCount: 2, nextService: { startsAt: "2026-10-15T08:00:00Z", status: "scheduled" } }),
        // A visit already in progress (started before now, not yet ended) counts too.
        row("e", { nextService: { startsAt: "2026-10-12T08:00:00Z", status: "in_progress" } }),
        row("b", { operatingStatus: "down", inspection: { state: "findings", recordedAt: null }, openDefects: { total: 3, failed: 1 } }),
        row("c", { pm: { state: "not_evaluated" }, inspection: { state: "none", recordedAt: null }, nextService: { startsAt: "2026-11-30T08:00:00Z", status: "scheduled" } }),
        row("d", { operatingStatus: "retired", pm: { state: "due" } }),
      ],
      NOW,
    );
    expect(summary).toMatchObject({
      total: 5,
      partial: false,
      pm: { overdue: 1, due: 1, ok: 2, not_evaluated: 1 },
      inspection: { none: 1, clear: 3, findings: 1, failed: 1 },
      openWork: { assets: 1, orders: 2 },
      upcomingService: 2,
    });
    expect(summary.status).toMatchObject({ operational: 3, down: 1, retired: 1 });
  });

  it("counts a machine as needing attention exactly when the directory filter does", () => {
    const summary = accumulateFleetSummary(
      emptyFleetSummary(),
      [
        row("ok"),
        row("overdue", { pm: { state: "overdue" } }),
        row("due", { pm: { state: "due" } }),
        row("down", { operatingStatus: "out_of_service" }),
        row("failed", { openDefects: { total: 1, failed: 1 } }),
        row("unevaluated", { pm: { state: "not_evaluated" } }),
      ],
      NOW,
    );
    expect(summary.needsAttention).toBe(4);
    expect(summary.attention.map((item) => item.assetId)).not.toContain("ok");
    expect(summary.attention.map((item) => item.assetId)).not.toContain("unevaluated");
  });

  it("keeps only the most urgent attention items across batches", () => {
    const summary = emptyFleetSummary();
    accumulateFleetSummary(summary, Array.from({ length: 15 }, (_, i) => row(`due-${i}`, { pm: { state: "due" } })), NOW);
    accumulateFleetSummary(summary, [row("down-and-overdue", { operatingStatus: "down", pm: { state: "overdue" } })], NOW);
    expect(summary.needsAttention).toBe(16);
    expect(summary.attention).toHaveLength(DASHBOARD_ATTENTION_LIMIT);
    expect(summary.attention[0]).toMatchObject({
      assetId: "down-and-overdue",
      reasons: ["Down", "PM overdue"],
    });
  });

  it("ranks overdue PM above failed findings above due PM, whatever else is flagged", () => {
    const score = (patch: Partial<FleetSignalRow>) => equipmentAttentionReasons(row("x", patch)).score;
    const overdueOnly = score({ pm: { state: "overdue" } });
    const failedOnly = score({ openDefects: { total: 1, failed: 1 } });
    const dueOnly = score({ pm: { state: "due" } });
    const down = score({ operatingStatus: "down" });
    expect(down).toBeGreaterThan(overdueOnly);
    expect(overdueOnly).toBeGreaterThan(failedOnly);
    expect(failedOnly).toBeGreaterThan(dueOnly);
    // Even failed findings plus due PM do not displace an overdue-only machine.
    expect(overdueOnly).toBeGreaterThan(score({ openDefects: { total: 9, failed: 9 }, pm: { state: "due" } }));
  });

  it("counts assets with failed findings, not findings", () => {
    const summary = accumulateFleetSummary(
      emptyFleetSummary(),
      [row("many", { inspection: { state: "findings", recordedAt: null }, openDefects: { total: 4, failed: 3 } })],
      NOW,
    );
    expect(summary.inspection).toMatchObject({ findings: 1, failed: 1 });
  });

  it("explains each reason once and pluralises failed findings", () => {
    expect(
      equipmentAttentionReasons({
        pm: { state: "due" },
        operatingStatus: "operational",
        openDefects: { total: 3, failed: 2 },
      }).reasons,
    ).toEqual(["2 failed findings", "PM due"]);
  });
});

