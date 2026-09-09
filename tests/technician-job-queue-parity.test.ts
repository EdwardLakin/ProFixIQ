import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  countTechnicianJobBuckets,
  isCompletedTechnicianJobStatus,
  isOpenTechnicianJob,
  toTechnicianJobBucket,
} from "@/features/work-orders/lib/technicianJobQueue";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("technician job queue rollup", () => {
  it("closes a job out of the queue on every terminal status", () => {
    for (const status of ["completed", "ready_to_invoice", "invoiced"]) {
      expect(isCompletedTechnicianJobStatus(status)).toBe(true);
      expect(isOpenTechnicianJob({ status })).toBe(false);
    }
    expect(isCompletedTechnicianJobStatus("Ready To Invoice")).toBe(true);
    expect(isCompletedTechnicianJobStatus("in_progress")).toBe(false);
    expect(isCompletedTechnicianJobStatus(null)).toBe(false);
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

  it("sources assigned rows from the server projection, not a browser read", () => {
    // work_orders_financial_capability_select and its work_order_lines twin are
    // restrictive policies that fail closed for staff without sell/invoice
    // visibility. A mechanic reading work_orders directly gets zero rows, which
    // is exactly the empty "My work orders" screen this guards against.
    expect(queue).toContain("if (canViewAssignedWork) {");
    expect(queue).toContain("fetchAssignedTechnicianWork({ scope })");
    expect(queue).toContain("assignedQueueFromBundle(bundle, status)");

    const assignedBranch = queue.slice(
      queue.indexOf("if (canViewAssignedWork) {"),
      queue.indexOf("let query = supabase"),
    );
    expect(assignedBranch).not.toContain('.from("work_orders")');
    expect(assignedBranch).not.toContain('.from("work_order_lines")');
  });

  it("applies the same lifecycle filters the shop-wide read applies", () => {
    expect(queue).toContain("if (workOrder.archived_at) continue;");
    expect(queue).toContain(
      'if (cleanText(workOrder.record_type) !== "work_order") continue;',
    );
    expect(queue).toContain("isActiveWorkOrderStatus(workOrderStatus)");
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
