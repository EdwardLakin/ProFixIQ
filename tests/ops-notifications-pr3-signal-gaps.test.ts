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

    it("reads the assignment cross-check through an admin client, not the interactive caller's own RLS-scoped client — a service/parts-role sync can read the candidate lines but not this bridge table, which would otherwise silently return empty instead of erroring", () => {
      expect(block).toContain(
        'await createAdminSupabase()\n        .from("work_order_line_technicians")',
      );
    });

    it("pushes terminal-status exclusion into the database query, not just a later JS filter — otherwise 150+ older terminal rows could consume the whole oldest-first candidate window and starve real candidates", () => {
      expect(opsNotificationsModule).toContain(
        'const TERMINAL_LINE_STATUSES_FILTER = `(${[...TERMINAL_LINE_STATUSES].join(",")})`;',
      );
      expect(opsNotificationsModule).toContain(
        '.not("status", "in", TERMINAL_LINE_STATUSES_FILTER)',
      );
    });

    it("excludes informational/note lines — the canonical lifecycle rejects line_type 'info'/'note' from assignment mutations, so an alert for one could never be resolved", () => {
      expect(opsNotificationsModule).toContain(
        'const NON_ACTIONABLE_LINE_TYPES = new Set(["info", "note"]);',
      );
      expect(opsNotificationsModule).toContain(", line_type,");
      expect(block).toContain(
        "NON_ACTIONABLE_LINE_TYPES.has(String(line.line_type ?? \"\").toLowerCase())",
      );
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

    it("skips an item whose linked canonical quote line has moved past draft — part_request_items.status stays 'quoted' even after the advisor already sent it, so the wait may already be on the customer, not the advisor", () => {
      expect(opsNotificationsModule).toContain(
        'const QUOTE_LINE_UNREVIEWED_STATUSES = new Set(["draft"]);',
      );
      expect(opsNotificationsModule).toContain(
        '.from("work_order_quote_lines")',
      );
      expect(opsNotificationsModule).toContain(
        "const reviewedQuoteLineIds = new Set<string>();",
      );
      expect(block).toContain(
        "if (item.quote_line_id && reviewedQuoteLineIds.has(item.quote_line_id)) {",
      );
    });
  });

  describe("parts received while job remains waiting", () => {
    const block = section(
      opsNotificationsModule,
      "// Parts received while the job remains waiting",
      "// Completed work awaiting closeout or invoicing",
    );

    it("queries only fully received part_request_items tied to a work order line — a partial receipt still leaves outstanding quantity on order", () => {
      expect(opsNotificationsModule).toContain(
        'const FULLY_RECEIVED_PART_ITEM_STATUS = "received";',
      );
      expect(opsNotificationsModule).toContain(
        '.eq("status", FULLY_RECEIVED_PART_ITEM_STATUS)',
      );
      expect(opsNotificationsModule).toContain(
        '.not("work_order_line_id", "is", null)',
      );
      expect(opsNotificationsModule).not.toContain("partially_received");
    });

    it("cross-references against the canonical parts-specific waiting_parts status, not a generic on_hold line that may be blocked for an unrelated reason", () => {
      expect(opsNotificationsModule).toContain(
        'const WAITING_ON_PARTS_LINE_STATUS = "waiting_parts";',
      );
      expect(opsNotificationsModule).toContain(
        '.eq("status", WAITING_ON_PARTS_LINE_STATUS)',
      );
      expect(opsNotificationsModule).toContain(
        "const waitingOnPartsLineIds = new Set(",
      );
      expect(block).toContain(
        "!waitingOnPartsLineIds.has(item.work_order_line_id)",
      );
    });

    it("dedupes to at most one notification per line — two received items against the same waiting line must never collide in the persisted upsert batch", () => {
      expect(block).toContain(
        "const earliestReceivedItemByWaitingLineId = new Map<string, PartRequestItemRow>();",
      );
      expect(block).toContain(
        "for (const item of earliestReceivedItemByWaitingLineId.values()) {",
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
