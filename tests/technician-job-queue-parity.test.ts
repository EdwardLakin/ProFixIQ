import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { countActiveWorkOrderLines } from "@/features/work-orders/lib/display/workOrderPresentation";
import { NON_ACTIVE_WORK_ORDER_LINE_STATUSES } from "@/features/work-orders/lib/line-status";
import {
  countTechnicianJobBuckets,
  isClosedTechnicianJobStatus,
  isOpenTechnicianJob,
  toTechnicianJobBucket,
} from "@/features/work-orders/lib/technicianJobQueue";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("technician job queue rollup", () => {
  it("closes a job out of the queue on every terminal status", () => {
    for (const status of ["completed", "ready_to_invoice", "invoiced"]) {
      expect(isClosedTechnicianJobStatus(status)).toBe(true);
      expect(isOpenTechnicianJob({ status })).toBe(false);
    }
    expect(isClosedTechnicianJobStatus("Ready To Invoice")).toBe(true);
    expect(isClosedTechnicianJobStatus("in_progress")).toBe(false);
    expect(isClosedTechnicianJobStatus(null)).toBe(false);
  });

  it("closes declined and deferred work the technician no longer owes", () => {
    // The customer decided this work will not happen now, so it leaves the
    // queue. The decision itself lives on work_order_quote_lines, which is
    // vehicle-scoped and keeps feeding next-visit recommendations.
    for (const status of ["declined", "deferred"]) {
      expect(isClosedTechnicianJobStatus(status)).toBe(true);
      expect(isOpenTechnicianJob({ status })).toBe(false);
    }
    // A punched-in clock must not resurrect a decided line.
    expect(
      isOpenTechnicianJob({
        status: "declined",
        punched_in_at: "2026-09-09T12:00:00Z",
        punched_out_at: null,
      }),
    ).toBe(false);
  });

  it("agrees with the canonical active-line count", () => {
    const lines = [
      { status: "active" },
      { status: "waiting_parts" },
      { status: "completed" },
      { status: "ready_to_invoice" },
      { status: "invoiced" },
      { status: "declined" },
      { status: "deferred" },
    ];

    expect(lines.filter(isOpenTechnicianJob)).toHaveLength(
      countActiveWorkOrderLines(lines),
    );
    for (const status of NON_ACTIVE_WORK_ORDER_LINE_STATUSES) {
      expect(isClosedTechnicianJobStatus(status)).toBe(true);
    }
  });

  it("treats the legacy active alias and an open punch as in progress", () => {
    expect(toTechnicianJobBucket({ status: "active" })).toBe("in_progress");
    expect(toTechnicianJobBucket({ status: "in progress" })).toBe(
      "in_progress",
    );
    expect(
      toTechnicianJobBucket({
        status: "awaiting",
        punched_in_at: "2026-09-09T12:00:00Z",
        punched_out_at: null,
      }),
    ).toBe("in_progress");
    expect(
      toTechnicianJobBucket({
        status: "awaiting",
        punched_in_at: "2026-09-09T12:00:00Z",
        punched_out_at: "2026-09-09T13:00:00Z",
      }),
    ).toBe("awaiting");
  });

  it("rolls unmapped open statuses into awaiting rather than dropping them", () => {
    // waiting_parts is a real persisted line status. Counting it nowhere is
    // what made Home disagree with My jobs.
    expect(toTechnicianJobBucket({ status: "waiting_parts" })).toBe("awaiting");
    expect(isOpenTechnicianJob({ status: "waiting_parts" })).toBe(true);
  });

  it("counts only open jobs, matching the shop queue rollup", () => {
    const lines = [
      { status: "active" },
      { status: "active" },
      { status: "awaiting" },
      { status: "waiting_parts" },
      { status: "on_hold" },
      { status: "completed" },
      { status: "invoiced" },
      { status: "declined" },
      { status: "deferred" },
    ];

    expect(countTechnicianJobBuckets(lines)).toEqual({
      in_progress: 2,
      awaiting: 2,
      on_hold: 1,
    });
    expect(lines.filter(isOpenTechnicianJob)).toHaveLength(5);
  });
});

describe("technician surfaces share one rollup", () => {
  const surfaces = [
    "app/tech/queue/page.tsx",
    "app/mobile/page.tsx",
    "features/mobile/technician/MobileTechnicianQueue.tsx",
  ];

  it("resolves every technician count through the shared module", () => {
    for (const surface of surfaces) {
      expect(read(surface)).toContain(
        "@/features/work-orders/lib/technicianJobQueue",
      );
    }
  });

  it("keeps completed jobs out of the mobile My jobs queue", () => {
    const mobileQueue = read(
      "features/mobile/technician/MobileTechnicianQueue.tsx",
    );
    expect(mobileQueue).toContain("isOpenTechnicianJob(line)");
    // The bucket union no longer carries a completed lane, so neither the
    // filter chips nor the counts can resurrect closed work.
    expect(mobileQueue).not.toContain('{ value: "completed", label: "Completed" }');
    expect(mobileQueue).not.toContain("completed: 0,");
  });
});

describe("assigned technician work-order queue", () => {
  const queue = read("features/mobile/work-orders/MobileWorkOrderQueue.tsx");
  const route = read("app/api/mobile/work-orders/assigned-queue/route.ts");

  it("sources assigned rows from the server projection, not a browser read", () => {
    // work_orders_financial_capability_select and its work_order_lines twin are
    // restrictive policies that fail closed for staff without sell/invoice
    // visibility. A mechanic reading work_orders directly gets zero rows, which
    // is exactly the empty "My work orders" screen this guards against.
    expect(queue).toContain("if (canViewAssignedWork) {");
    expect(queue).toContain("fetchAssignedQueue(status)");

    const assignedBranch = queue.slice(
      queue.indexOf("if (canViewAssignedWork) {"),
      queue.indexOf("let query = supabase"),
    );
    expect(assignedBranch).not.toContain('.from("work_orders")');
    expect(assignedBranch).not.toContain('.from("work_order_lines")');
  });

  it("bounds the assigned queue read instead of pulling the offline bundle", () => {
    // The offline bundle walks every line ever assigned and hydrates quote
    // lines, canonical contexts, customers and vehicles per work order. That is
    // right for an explicit download and far too much for a list that reloads
    // on every filter change, focus and realtime event.
    expect(queue).not.toContain("fetchAssignedTechnicianWork");
    expect(queue).not.toContain("technicianOfflineDownload");

    expect(route).toContain("const MAX_LIMIT = 100;");
    expect(route).toContain(".limit(limit)");
    // The lifecycle filter runs in the database, so closed history never ships.
    expect(route).toContain(
      'workOrderQuery.in("status", [...ACTIVE_WORK_ORDER_STATUSES])',
    );
    expect(route).toContain('workOrderQuery.eq("status", requestedStatus)');
    expect(route).toContain(".in(\"id\", assignedWorkOrderIds)");
  });

  it("keeps the route authorized and financially projected", () => {
    expect(route).toContain("requireShopScopedApiAccess");
    expect(route).toContain("actor.canPerformAssignedWork");
    expect(route).toContain("resolveTechnicianAssignmentContract");
    expect(route).toContain("projectWorkOrderFinancialFields");
    expect(route).toContain("projectWorkOrderLineFinancialFields");
  });

  it("applies the same lifecycle filters the shop-wide read applies", () => {
    expect(route).toContain('.eq("record_type", "work_order")');
    expect(route).toContain('.is("archived_at", null)');
  });

  it("surfaces a failed assigned load instead of an empty queue", () => {
    // Without this the fetch rejection was unhandled and the screen settled on
    // "0 active work orders assigned to you" — the exact symptom being fixed.
    expect(queue).toContain("} catch (caught) {");
    expect(queue).toContain("setErrorMessage(");
    expect(queue).toContain('if (mode === "initial") {');
    expect(queue).toContain(
      '"Work orders could not be loaded — retry to see your current count."',
    );
    expect(queue).toContain('errorMessage ? "Work orders unavailable"');
  });

  it("folds both read paths through one signal accumulator", () => {
    expect(queue).toContain("function accumulateLineSignal(");
    // Two call sites: the assigned projection and the shop-wide read.
    expect(
      queue.match(/(?<!function )accumulateLineSignal\(/g) ?? [],
    ).toHaveLength(2);
    expect(queue).toContain('toTechnicianJobBucket(line) === "in_progress"');
  });
});
