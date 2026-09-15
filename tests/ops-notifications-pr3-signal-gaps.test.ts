import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const opsNotificationsModule = readFileSync(
  "features/agent/server/getOpsNotifications.ts",
  "utf8",
);
const shopStateModule = readFileSync(
  "features/shop-assistant/server/state/buildShopState.ts",
  "utf8",
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("PR 3 signal gaps — closes the four proactive shadow-mode signals the updated audit calls out as missing", () => {
  it("registers all four new codes in the shared ops-notification vocabulary shared by both consumers", () => {
    expect(opsNotificationsModule).toContain('"approved_work_unassigned"');
    expect(opsNotificationsModule).toContain('"parts_quote_awaiting_review"');
    expect(opsNotificationsModule).toContain('"parts_received_job_waiting"');
    expect(opsNotificationsModule).toContain(
      '"work_order_completed_awaiting_closeout"',
    );
  });

  describe("approved work not assigned", () => {
    const block = section(
      opsNotificationsModule,
      "const candidateApprovedLines = approvedUnassignedLines.filter",
      "// Quoted parts awaiting advisor review",
    );

    it("pre-filters to approved/authorized, non-terminal lines with neither legacy assignment column set", () => {
      expect(opsNotificationsModule).toContain(
        '.or("approval_state.eq.approved,line_status.eq.authorized")',
      );
      expect(opsNotificationsModule).toContain('.is("assigned_tech_id", null)');
      expect(opsNotificationsModule).toContain('.is("assigned_to", null)');
      expect(opsNotificationsModule).toContain('.is("voided_at", null)');
      expect(block).toContain("TERMINAL_LINE_STATUSES.has(");
    });

    it("confirms against work_order_line_technicians before treating a line as truly unassigned — a canonical multi-tech assignment can exist without either legacy column set", () => {
      expect(block).toContain('.from("work_order_line_technicians")');
      expect(block).toContain('.select("work_order_line_id, technician_id")');
      expect(block).toContain("canonicallyAssignedLineIds.has(line.id)");
    });

    it("only fires past the threshold, measured from approval time falling back to updated_at", () => {
      expect(block).toContain("line.approval_at ?? line.updated_at");
      expect(block).toContain("hours < UNASSIGNED_APPROVED_WORK_HOURS");
      expect(opsNotificationsModule).toContain(
        "const UNASSIGNED_APPROVED_WORK_HOURS = 8;",
      );
    });

    it("carries actionable entity identity for the technician-assignment surface", () => {
      expect(block).toContain('code: "approved_work_unassigned"');
      expect(block).toContain('entityType: "work_order_line"');
      expect(block).toContain(
        "href: line.work_order_id\n          ? `/work-orders/${line.work_order_id}/focused-job/${line.id}`",
      );
    });
  });

  describe("quoted parts awaiting advisor review", () => {
    const block = section(
      opsNotificationsModule,
      "// Quoted parts awaiting advisor review",
      "// Parts received while the job remains waiting",
    );

    it("queries part_request_items filtered to the quoted status", () => {
      expect(opsNotificationsModule).toContain('.from("part_request_items")');
      expect(opsNotificationsModule).toContain('.eq("status", "quoted")');
    });

    it("only fires past the review threshold, measured from updated_at falling back to created_at", () => {
      expect(block).toContain("item.updated_at ?? item.created_at");
      expect(block).toContain("hours < QUOTED_PARTS_REVIEW_HOURS");
      expect(opsNotificationsModule).toContain(
        "const QUOTED_PARTS_REVIEW_HOURS = 24;",
      );
    });

    it("links to the parts request for advisor action", () => {
      expect(block).toContain('code: "parts_quote_awaiting_review"');
      expect(block).toContain(
        "href: item.request_id ? `/parts/requests/${item.request_id}` : undefined",
      );
    });
  });

  describe("parts received while job remains waiting", () => {
    const block = section(
      opsNotificationsModule,
      "// Parts received while the job remains waiting",
      "// Completed work awaiting closeout or invoicing",
    );

    it("queries received/partially_received part_request_items tied to a work order line", () => {
      expect(opsNotificationsModule).toContain(
        'const RECEIVED_PART_ITEM_STATUSES = new Set(["received", "partially_received"]);',
      );
      expect(opsNotificationsModule).toContain(
        '.in("status", [...RECEIVED_PART_ITEM_STATUSES])',
      );
      expect(opsNotificationsModule).toContain(
        '.not("work_order_line_id", "is", null)',
      );
    });

    it("cross-references against the already-loaded on-hold lines rather than a second work_order_lines scan", () => {
      expect(opsNotificationsModule).toContain(
        "const onHoldLineIds = new Set(lineRows.map((line) => line.id));",
      );
      expect(block).toContain(
        "!item.work_order_line_id || !onHoldLineIds.has(item.work_order_line_id)",
      );
    });

    it("fires at urgent level past the threshold — a resolved blocker sitting idle is more actionable than a routine wait", () => {
      expect(block).toContain('level: "urgent"');
      expect(block).toContain('code: "parts_received_job_waiting"');
      expect(block).toContain("hours < PARTS_RECEIVED_JOB_WAITING_HOURS");
      expect(opsNotificationsModule).toContain(
        "const PARTS_RECEIVED_JOB_WAITING_HOURS = 12;",
      );
    });
  });

  describe("completed work awaiting closeout or invoicing", () => {
    const block = section(
      opsNotificationsModule,
      "// Completed work awaiting closeout or invoicing",
      "const loadMetrics = await getTechnicianLoadMetricsWithClient",
    );

    it("queries work_orders filtered to completed status, distinct from the invoice-unsent signal's source view", () => {
      expect(opsNotificationsModule).toContain(
        'const { data: completedWorkOrders, error: completedWorkOrdersError } = await supabase\n    .from("work_orders")',
      );
      expect(opsNotificationsModule).toContain('.eq("status", "completed")');
    });

    it("only fires past the closeout threshold, measured from updated_at", () => {
      expect(block).toContain("ageHours(row.updated_at)");
      expect(block).toContain("hours < COMPLETED_AWAITING_CLOSEOUT_HOURS");
      expect(opsNotificationsModule).toContain(
        "const COMPLETED_AWAITING_CLOSEOUT_HOURS = 24;",
      );
    });

    it("carries work-order entity identity", () => {
      expect(block).toContain('code: "work_order_completed_awaiting_closeout"');
      expect(block).toContain('entityType: "work_order"');
      expect(block).toContain("href: `/work-orders/${row.id}`");
    });
  });

  it("flows automatically through the shadow-mode blocker observer with no extra wiring — it consumes getOpsNotifications generically", () => {
    const syncShopBlockerObservations = readFileSync(
      "features/operations/server/syncShopBlockerObservations.ts",
      "utf8",
    );
    expect(syncShopBlockerObservations).toContain("getOpsNotifications(");
    expect(syncShopBlockerObservations).not.toContain(
      '"approved_work_unassigned"',
    );
    expect(syncShopBlockerObservations).not.toContain(
      '"parts_quote_awaiting_review"',
    );
    expect(syncShopBlockerObservations).not.toContain(
      '"parts_received_job_waiting"',
    );
    expect(syncShopBlockerObservations).not.toContain(
      '"work_order_completed_awaiting_closeout"',
    );
  });

  it("is visible on the shop-assistant alert surface to the right role visibility buckets, not silently dropped by the default work-order gate", () => {
    expect(shopStateModule).toContain(
      'alert.code === "parts_delivery_overdue" ||\n    alert.code === "ai_parts_request_prepared" ||\n    alert.code === "parts_quote_awaiting_review" ||\n    alert.code === "parts_received_job_waiting"',
    );
    expect(shopStateModule).toContain(
      'alert.code === "invoice_ready" ||\n    alert.code === "work_order_completed_awaiting_closeout"',
    );
    expect(shopStateModule).toContain(
      'if (alert.code === "approved_work_unassigned") {\n    return visibility.workforce || visibility.workOrders;',
    );
  });

  it("never writes to a work order, line, part request, or invoice — purely a read/detect signal like every other ops notification", () => {
    const block = section(
      opsNotificationsModule,
      "const candidateApprovedLines = approvedUnassignedLines.filter",
      "const loadMetrics = await getTechnicianLoadMetricsWithClient",
    );
    expect(block).not.toMatch(
      /\.from\(\s*["'](work_orders|work_order_lines|part_requests|part_request_items|work_order_line_technicians)["']\)[\s\S]{0,200}\.\s*(insert|update|upsert|delete)\(/,
    );
  });
});
