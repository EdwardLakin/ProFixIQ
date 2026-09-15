import { getServerSupabase } from "./supabase";
import { FLOW_HEALTH_THRESHOLDS, ageHours } from "./flowHealth";
import { getTechnicianLoadMetricsWithClient } from "@shared/lib/stats/getTechnicianLoadMetricsCore";
import { getShopDayRange } from "@shared/lib/utils/shopDayWindow";
import { buildOptimizationOpportunities } from "@/features/optimization/server/buildOptimizationOpportunities";
import type { OptimizationOpportunity } from "@/features/optimization/types";
import { ACTIONABLE_WORK_ORDER_NOTIFICATION_FILTER } from "@/features/shared/lib/workboard/utils";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type {
  MatchedMenuItem as AppointmentMatchedMenuItem,
  MissingInfoFlag as AppointmentMissingInfoFlag,
  VehicleSnapshot as AppointmentVehicleSnapshot,
} from "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations";

export type OpsNotificationLevel = "info" | "warning" | "urgent";

export type OpsNotificationCode =
  | "quote_waiting"
  | "approval_waiting"
  | "work_order_on_hold_too_long"
  | "work_order_waiting_too_long"
  | "parts_waiting_too_long"
  | "invoice_unsent_too_long"
  | "tech_overloaded"
  | "shop_overloaded"
  | "tech_underutilized_capacity"
  | "active_job_running_too_long"
  | "shop_throughput_below_capacity"
  | "optimization_pricing_normalization"
  | "optimization_inspection_coverage_gap"
  | "optimization_missed_revenue"
  | "optimization_review_queued_suggestions"
  | "ai_parts_request_prepared"
  | "approved_work_unassigned"
  | "parts_quote_awaiting_review"
  | "parts_received_job_waiting"
  | "work_order_completed_awaiting_closeout"
  | "appointment_day_of_readiness";

export type OpsNotification = {
  level: OpsNotificationLevel;
  code: OpsNotificationCode;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
  // The specific rule inputs (thresholds, current values) this notification
  // fired on, independent of the presentation message. Optional so this is
  // purely additive for existing callers.
  evidence?: Record<string, unknown>;
};

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type WorkOrderLineRow = {
  id: string;
  work_order_id: string | null;
  status: string | null;
  description: string | null;
  complaint: string | null;
  hold_reason: string | null;
  on_hold_since: string | null;
  updated_at: string | null;
};

type BoardRow = {
  work_order_id: string;
  custom_id: string | null;
  display_name: string | null;
  overall_stage: string | null;
  has_waiting_parts: boolean | null;
  time_in_stage_seconds: number | null;
};

type PortalInvoiceRow = {
  work_order_id: string | null;
  status: string | null;
  invoice_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ApprovedUnassignedLineRow = {
  id: string;
  work_order_id: string | null;
  status: string | null;
  description: string | null;
  complaint: string | null;
  approval_state: string | null;
  line_status: string | null;
  line_type: string | null;
  approval_at: string | null;
  assigned_tech_id: string | null;
  assigned_to: string | null;
  updated_at: string | null;
};

type PartRequestItemRow = {
  id: string;
  request_id: string | null;
  work_order_id: string | null;
  work_order_line_id: string | null;
  description: string | null;
  status: string | null;
  quoted_price: number | null;
  quote_line_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type DayOfAppointmentPreparationRow = {
  id: string;
  booking_id: string;
  starts_at: string;
  vehicle_id: string | null;
  vehicle_snapshot: unknown;
  missing_info: unknown;
  matched_menu_items: unknown;
};

const SHOP_OVERLOAD_UTILIZATION_PCT = 90;
const SHOP_UNDERUTILIZATION_PCT = 40;
const TECH_OVERLOAD_UTILIZATION_PCT = 95;
const TECH_OVERLOAD_ACTIVE_JOBS = 3;
const LOW_THROUGHPUT_MIN_ELAPSED_HOURS = 6;
const LOW_THROUGHPUT_MIN_SHIFTED_TECHS = 2;
const LOW_THROUGHPUT_MAX_COMPLETIONS_PER_TECH = 0.5;
const UNASSIGNED_APPROVED_WORK_HOURS = 8;
const QUOTED_PARTS_REVIEW_HOURS = 24;
const PARTS_RECEIVED_JOB_WAITING_HOURS = 12;
const COMPLETED_AWAITING_CLOSEOUT_HOURS = 24;
// A line counts as "approved" for this signal the same way the shop-
// assistant parts-request RPC already does (v_preapproved in
// create_part_request_with_items): explicit approval_state, or the
// line_status reaching "authorized".
const APPROVED_LINE_STATUSES = new Set(["approved"]);
const AUTHORIZED_LINE_STATUSES = new Set(["authorized"]);
// A line in any of these terminal states is done or dead - never a
// candidate for "still needs a technician assigned".
const TERMINAL_LINE_STATUSES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "cancelled",
  "canceled",
  "voided",
]);
// Matches the terminal-status list this codebase's other read paths use
// verbatim when they need it as a Postgrest `not(... in (...))` filter
// (e.g. assignedWork.ts's TERMINAL_WORK_ORDER_STATUSES usage).
const TERMINAL_LINE_STATUSES_FILTER = `(${[...TERMINAL_LINE_STATUSES].join(",")})`;
// Non-actionable line types the canonical work-order lifecycle already
// rejects for assignment/labor mutations (see e.g. the
// pre_labor_parts_quote_hold and add_staff_line_decision_boundary
// migrations' `line_type not in ('info','note')` guards) — an "assign a
// technician" alert for one of these could never be resolved through the
// supported workflow.
const NON_ACTIONABLE_LINE_TYPES = new Set(["info", "note"]);
// A partially received item still has outstanding quantity on order — the
// canonical receiving flow (parts_sync_work_order_line_fulfillment_status)
// only clears a line's parts blocker once every approved quantity is
// staged, so only a fully "received" item can mean the blocker is gone.
const FULLY_RECEIVED_PART_ITEM_STATUS = "received";
// The one work_order_lines status the canonical parts-fulfillment trigger
// itself sets while a line is blocked specifically on parts (as opposed to
// a generic "on_hold" for an unrelated reason such as customer approval or
// a safety concern) — see parts_sync_work_order_line_fulfillment_status's
// 'order_receive' stage transition.
const WAITING_ON_PARTS_LINE_STATUS = "waiting_parts";
// A linked canonical quote line still in its initial "draft" status means
// the advisor has not yet acted on it; anything further along (sent,
// approved, declined, converted, ...) means the wait has already moved
// past "needs advisor review" even though the linked part_request_item's
// own status is still "quoted".
const QUOTE_LINE_UNREVIEWED_STATUSES = new Set(["draft"]);
// Mirrors the labels the read-only appointment-preparation list already
// shows staff (features/shop-assistant/components/AppointmentPreparationList.tsx)
// so this notification's wording matches what a reviewer sees when they
// follow the href back to that projection.
const MISSING_INFO_ISSUE_LABELS: Record<string, string> = {
  missing_vehicle: "no vehicle on file",
  missing_customer: "no customer on file",
  missing_vin: "missing VIN",
  missing_mileage: "missing mileage",
  missing_customer_contact: "no customer contact info",
};

function secondsToHours(seconds: number | null | undefined): number {
  const parsed = Number(seconds ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed / 3600;
}

function woLabel(customId: string | null, id: string): string {
  return customId ? `WO #${customId}` : `WO ${id.slice(0, 8)}`;
}

function isInvoiceReadyToSend(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .toLowerCase()
    .replaceAll(" ", "_");

  return (
    normalized === "ready_to_invoice" ||
    normalized === "completed" ||
    normalized === "invoiced"
  );
}

function optimizationHref(opportunity: OptimizationOpportunity): string {
  if (opportunity.type === "pricing_normalization") {
    return opportunity.targetRefs?.menuItemId
      ? `/menu/item/${opportunity.targetRefs.menuItemId}`
      : "/dashboard";
  }
  if (opportunity.type === "inspection_coverage_gap") {
    return opportunity.targetRefs?.inspectionTemplateId
      ? `/inspections/templates?templateId=${encodeURIComponent(opportunity.targetRefs.inspectionTemplateId)}`
      : "/inspection_template_suggestions";
  }
  return "/menu_item_suggestions";
}

function toOptimizationCode(
  type: OptimizationOpportunity["type"],
): OpsNotificationCode {
  if (type === "pricing_normalization") {
    return "optimization_pricing_normalization";
  }
  if (type === "inspection_coverage_gap") {
    return "optimization_inspection_coverage_gap";
  }
  return "optimization_missed_revenue";
}

export async function getOpsNotifications(
  shopId: string,
  supabaseClient?: ReturnType<typeof getServerSupabase>,
): Promise<OpsNotification[]> {
  // Defaults to the request-scoped client for existing on-demand callers.
  // A scheduled/service-context caller (no signed-in user, no cookies) must
  // inject an admin client instead.
  const supabase = supabaseClient ?? getServerSupabase();

  const notifications: OpsNotification[] = [];

  const { data: workOrders, error: woError } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, created_at, updated_at")
    .eq("shop_id", shopId)
    .in("status", [
      "awaiting",
      "awaiting_approval",
      "queued",
      "on_hold",
      "planned",
      "in_progress",
    ])
    .order("updated_at", { ascending: true })
    .limit(120);

  if (woError) {
    throw new Error(woError.message);
  }

  const { data: boardRows, error: boardError } = await supabase
    .from("v_work_order_board_cards_shop")
    .select("work_order_id, custom_id, display_name, overall_stage, has_waiting_parts, time_in_stage_seconds")
    .eq("shop_id", shopId)
    .or(ACTIONABLE_WORK_ORDER_NOTIFICATION_FILTER)
    .order("time_in_stage_seconds", { ascending: false })
    .limit(120);

  if (boardError) {
    throw new Error(boardError.message);
  }

  const { data: heldLines, error: lineError } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, description, complaint, hold_reason, on_hold_since, updated_at",
    )
    .eq("shop_id", shopId)
    .eq("status", "on_hold")
    .order("updated_at", { ascending: true })
    .limit(150);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const { data: portalInvoices, error: invoiceError } = await supabase
    .from("v_portal_invoices")
    .select("work_order_id, status, invoice_sent_at, created_at, updated_at")
    .eq("shop_id", shopId)
    .is("invoice_sent_at", null)
    .order("updated_at", { ascending: true })
    .limit(120);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const { data: approvedLines, error: approvedLinesError } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, description, complaint, approval_state, line_status, line_type, approval_at, assigned_tech_id, assigned_to, updated_at",
    )
    .eq("shop_id", shopId)
    .is("voided_at", null)
    .or("approval_state.eq.approved,line_status.eq.authorized")
    .is("assigned_tech_id", null)
    .is("assigned_to", null)
    // Terminal rows must never consume the oldest-first candidate window —
    // a shop with 150+ older completed/cancelled lines whose legacy
    // assignment columns are null would otherwise push every genuinely
    // active, unassigned approved line out of this page.
    .not("status", "in", TERMINAL_LINE_STATUSES_FILTER)
    .order("updated_at", { ascending: true })
    .limit(150);

  if (approvedLinesError) {
    throw new Error(approvedLinesError.message);
  }

  const { data: quotedPartItems, error: quotedPartItemsError } = await supabase
    .from("part_request_items")
    .select(
      "id, request_id, work_order_id, work_order_line_id, description, status, quoted_price, quote_line_id, updated_at, created_at",
    )
    .eq("shop_id", shopId)
    .eq("status", "quoted")
    .order("updated_at", { ascending: true })
    .limit(150);

  if (quotedPartItemsError) {
    throw new Error(quotedPartItemsError.message);
  }

  const { data: receivedPartItems, error: receivedPartItemsError } = await supabase
    .from("part_request_items")
    .select(
      "id, request_id, work_order_id, work_order_line_id, description, status, quoted_price, quote_line_id, updated_at, created_at",
    )
    .eq("shop_id", shopId)
    .eq("status", FULLY_RECEIVED_PART_ITEM_STATUS)
    .not("work_order_line_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(150);

  if (receivedPartItemsError) {
    throw new Error(receivedPartItemsError.message);
  }

  // The line the canonical parts-fulfillment trigger itself blocks on
  // parts (as opposed to a generic "on_hold" for an unrelated reason) is
  // the only state that makes "parts arrived, job still waiting" a valid
  // signal — see WAITING_ON_PARTS_LINE_STATUS above.
  const { data: waitingOnPartsLines, error: waitingOnPartsLinesError } =
    await supabase
      .from("work_order_lines")
      .select("id")
      .eq("shop_id", shopId)
      .eq("status", WAITING_ON_PARTS_LINE_STATUS)
      .limit(150);

  if (waitingOnPartsLinesError) {
    throw new Error(waitingOnPartsLinesError.message);
  }

  const { data: completedWorkOrders, error: completedWorkOrdersError } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, created_at, updated_at")
    .eq("shop_id", shopId)
    .eq("status", "completed")
    .order("updated_at", { ascending: true })
    .limit(120);

  if (completedWorkOrdersError) {
    throw new Error(completedWorkOrdersError.message);
  }

  // Phase 6 (day-of orchestration): the shop's own local "today", not a
  // fixed UTC day or an elapsed-hours window — a shop in a different
  // timezone must not see yesterday's or tomorrow's bookings flagged.
  const { data: shopRow, error: shopTimezoneError } = await supabase
    .from("shops")
    .select("timezone")
    .eq("id", shopId)
    .maybeSingle();
  if (shopTimezoneError) {
    throw new Error(shopTimezoneError.message);
  }
  const todayRange = getShopDayRange(shopRow?.timezone ?? null);

  // appointment_preparations is locked to the service role at the table
  // level — "revoke all ... from anon, authenticated" in its migration,
  // the same lockdown as the Phase 3 shadow-mode blocker table — so no
  // interactive caller's own client can read it at all, regardless of RLS.
  // The live/on-demand sync path (e.g. app/api/planner/notifications)
  // calls this function with the plain cookie-backed client, so querying
  // this table with `supabase` would throw a permission error on every
  // interactive request. An admin client is safe here: the read is scoped
  // by shop_id below, and this function's own callers already authorize
  // the caller before reaching it.
  const { data: dayOfPreparations, error: dayOfPreparationsError } =
    await createAdminSupabase()
      .from("appointment_preparations")
      .select(
        "id, booking_id, starts_at, vehicle_id, vehicle_snapshot, missing_info, matched_menu_items",
      )
      .eq("shop_id", shopId)
      .eq("status", "active")
      .gte("starts_at", todayRange.start)
      .lt("starts_at", todayRange.end)
      .order("starts_at", { ascending: true })
      .limit(120);

  if (dayOfPreparationsError) {
    throw new Error(dayOfPreparationsError.message);
  }

  const woRows = (workOrders ?? []) as WorkOrderRow[];
  const lineRows = (heldLines ?? []) as WorkOrderLineRow[];
  const stageRows = (boardRows ?? []) as BoardRow[];
  const unsentInvoices = (portalInvoices ?? []) as PortalInvoiceRow[];
  const approvedUnassignedLines = (approvedLines ?? []) as ApprovedUnassignedLineRow[];
  const quotedItems = (quotedPartItems ?? []) as PartRequestItemRow[];
  const receivedItems = (receivedPartItems ?? []) as PartRequestItemRow[];
  const completedWoRows = (completedWorkOrders ?? []) as WorkOrderRow[];
  const dayOfPreparationRows = (dayOfPreparations ?? []) as DayOfAppointmentPreparationRow[];

  const workOrderById = new Map<string, WorkOrderRow>();
  for (const row of woRows) {
    workOrderById.set(row.id, row);
  }
  for (const row of completedWoRows) {
    workOrderById.set(row.id, row);
  }

  const waitingOnPartsLineIds = new Set(
    (waitingOnPartsLines ?? []).map((line) => line.id),
  );

  const seenApprovalFromBoard = new Set<string>();

  for (const row of stageRows) {
    const stage = String(row.overall_stage ?? "").toLowerCase();
    const hours = secondsToHours(row.time_in_stage_seconds);

    if (
      stage === "awaiting_approval" &&
      hours >= FLOW_HEALTH_THRESHOLDS.approvalWaitHours
    ) {
      seenApprovalFromBoard.add(row.work_order_id);
      notifications.push({
        level: "warning",
        code: "approval_waiting",
        title: "Approval waiting too long",
        message: `${woLabel(row.custom_id, row.work_order_id)} has been waiting for approval for ${hours.toFixed(1)} hours.`,
        href: `/quote-review/${row.work_order_id}`,
        entityType: "work_order",
        entityId: row.work_order_id,
        evidence: {
          source: "board",
          hoursWaiting: hours,
          thresholdHours: FLOW_HEALTH_THRESHOLDS.approvalWaitHours,
        },
      });
      continue;
    }

    if (
      stage === "waiting" &&
      row.has_waiting_parts === true &&
      hours >= FLOW_HEALTH_THRESHOLDS.partsWaitHours
    ) {
      notifications.push({
        level: "warning",
        code: "parts_waiting_too_long",
        title: "Parts waiting too long",
        message: `${woLabel(row.custom_id, row.work_order_id)} has been waiting on parts for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.work_order_id}`,
        entityType: "work_order",
        entityId: row.work_order_id,
        evidence: {
          source: "board",
          hoursWaiting: hours,
          thresholdHours: FLOW_HEALTH_THRESHOLDS.partsWaitHours,
        },
      });
    }
  }

  for (const row of woRows) {
    const hours = ageHours(row.updated_at);
    if (hours == null) continue;

    if (
      row.status === "awaiting_approval" &&
      hours >= FLOW_HEALTH_THRESHOLDS.approvalWaitHours &&
      !seenApprovalFromBoard.has(row.id)
    ) {
      notifications.push({
        level: "warning",
        code: "approval_waiting",
        title: "Approval waiting too long",
        message: `${woLabel(row.custom_id, row.id)} has been awaiting approval for ${hours.toFixed(1)} hours.`,
        href: `/quote-review/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
        evidence: {
          source: "work_order",
          hoursWaiting: hours,
          thresholdHours: FLOW_HEALTH_THRESHOLDS.approvalWaitHours,
          status: row.status,
        },
      });
      continue;
    }

    if (row.status === "queued" && hours >= FLOW_HEALTH_THRESHOLDS.queuedWaitHours) {
      notifications.push({
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "Queued too long",
        message: `${woLabel(row.custom_id, row.id)} has been queued for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
        evidence: {
          hoursQueued: hours,
          thresholdHours: FLOW_HEALTH_THRESHOLDS.queuedWaitHours,
          status: row.status,
        },
      });
      continue;
    }

    if (row.status === "on_hold" && hours >= FLOW_HEALTH_THRESHOLDS.onHoldWaitHours) {
      notifications.push({
        level: "urgent",
        code: "work_order_on_hold_too_long",
        title: "Work order on hold too long",
        message: `${woLabel(row.custom_id, row.id)} has been on hold for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
        evidence: {
          source: "work_order",
          hoursOnHold: hours,
          thresholdHours: FLOW_HEALTH_THRESHOLDS.onHoldWaitHours,
        },
      });
    }
    if (
      row.status === "in_progress" &&
      hours >= FLOW_HEALTH_THRESHOLDS.unusuallyLongActiveJobHours
    ) {
      notifications.push({
        level: hours >= FLOW_HEALTH_THRESHOLDS.unusuallyLongActiveJobHours + 2 ? "urgent" : "warning",
        code: "active_job_running_too_long",
        title: "Unusually long active job",
        message: `${woLabel(row.custom_id, row.id)} has remained active for ${hours.toFixed(1)} hours without an update.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
        evidence: {
          hoursActive: hours,
          thresholdHours: FLOW_HEALTH_THRESHOLDS.unusuallyLongActiveJobHours,
        },
      });
    }
  }

  for (const line of lineRows) {
    const since = line.on_hold_since ?? line.updated_at;
    const hours = ageHours(since);
    if (hours == null || hours < FLOW_HEALTH_THRESHOLDS.onHoldWaitHours) continue;

    const workOrder = line.work_order_id
      ? workOrderById.get(line.work_order_id)
      : undefined;

    notifications.push({
      level: "urgent",
      code: "work_order_on_hold_too_long",
      title: "Held job line needs attention",
      message:
        `${workOrder ? woLabel(workOrder.custom_id, workOrder.id) : "Work order"}: ` +
        `${line.description ?? line.complaint ?? "Held line"} ` +
        `has been on hold for ${hours.toFixed(1)} hours` +
        `${line.hold_reason ? ` — ${line.hold_reason}` : ""}.`,
      href: line.work_order_id
        ? `/work-orders/${line.work_order_id}/focused-job/${line.id}`
        : undefined,
      entityType: "work_order_line",
      entityId: line.id,
      createdAt: since ?? undefined,
      evidence: {
        hoursOnHold: hours,
        thresholdHours: FLOW_HEALTH_THRESHOLDS.onHoldWaitHours,
        holdReason: line.hold_reason ?? null,
      },
    });
  }

  for (const invoice of unsentInvoices) {
    if (!isInvoiceReadyToSend(invoice.status)) continue;

    const since = invoice.updated_at ?? invoice.created_at;
    const hours = ageHours(since);
    if (hours == null || hours < FLOW_HEALTH_THRESHOLDS.unsentInvoiceHours) continue;

    notifications.push({
      level: "warning",
      code: "invoice_unsent_too_long",
      title: "Invoice unsent too long",
      message: `A ready invoice has remained unsent for ${hours.toFixed(1)} hours.`,
      href: invoice.work_order_id
        ? `/work-orders/${invoice.work_order_id}`
        : "/portal/invoices",
      entityType: "invoice",
      entityId: invoice.work_order_id ?? undefined,
      createdAt: since ?? undefined,
      evidence: {
        hoursUnsent: hours,
        thresholdHours: FLOW_HEALTH_THRESHOLDS.unsentInvoiceHours,
        status: invoice.status,
      },
    });
  }

  // Approved work not assigned: assigned_tech_id/assigned_to being null is
  // only a cheap pre-filter (the query above already narrowed to that) — a
  // canonical multi-tech assignment can still exist via
  // work_order_line_technicians without either legacy field set, so confirm
  // against that table the same way resolveTechnicianAssignmentContract's
  // callers elsewhere already do before treating a line as truly unassigned.
  const candidateApprovedLines = approvedUnassignedLines.filter((line) => {
    if (TERMINAL_LINE_STATUSES.has(String(line.status ?? "").toLowerCase())) {
      return false;
    }
    // An informational/note line is never actionable through the
    // supported assignment workflow (the canonical lifecycle mutations
    // reject line_type = 'info'/'note' outright) — an "assign a
    // technician" alert for one of these could never be resolved.
    if (NON_ACTIONABLE_LINE_TYPES.has(String(line.line_type ?? "").toLowerCase())) {
      return false;
    }
    const approvalState = String(line.approval_state ?? "").toLowerCase();
    const lineStatus = String(line.line_status ?? "").toLowerCase();
    return (
      APPROVED_LINE_STATUSES.has(approvalState) ||
      AUTHORIZED_LINE_STATUSES.has(lineStatus)
    );
  });

  if (candidateApprovedLines.length > 0) {
    // This cross-check must see every canonical assignment regardless of
    // the interactive caller's own row-level access — an interactive
    // service/parts-role sync can read the candidate lines above via RLS
    // but not this bridge table, which would otherwise return an empty
    // (not errored) result and misreport a genuinely assigned line as
    // unassigned. An admin client is safe here: every id queried already
    // came from a shop_id-scoped read above, so there is no cross-tenant
    // exposure.
    const { data: canonicalAssignments, error: canonicalAssignmentsError } =
      await createAdminSupabase()
        .from("work_order_line_technicians")
        .select("work_order_line_id, technician_id")
        .in(
          "work_order_line_id",
          candidateApprovedLines.map((line) => line.id),
        );

    if (canonicalAssignmentsError) {
      throw new Error(canonicalAssignmentsError.message);
    }

    const canonicallyAssignedLineIds = new Set(
      (canonicalAssignments ?? [])
        .map((row) => row.work_order_line_id)
        .filter((value): value is string => typeof value === "string"),
    );

    for (const line of candidateApprovedLines) {
      // assigned_tech_id and assigned_to are already guaranteed null by the
      // query filter above; canonicallyAssignedLineIds is the one remaining
      // assignment source (resolveTechnicianAssignmentContract's contract)
      // left to check before this line truly has nobody assigned.
      if (canonicallyAssignedLineIds.has(line.id)) continue;

      const since = line.approval_at ?? line.updated_at;
      const hours = ageHours(since);
      if (hours == null || hours < UNASSIGNED_APPROVED_WORK_HOURS) continue;

      const workOrder = line.work_order_id
        ? workOrderById.get(line.work_order_id)
        : undefined;

      notifications.push({
        level: "warning",
        code: "approved_work_unassigned",
        title: "Approved work not assigned",
        message:
          `${workOrder ? woLabel(workOrder.custom_id, workOrder.id) : "Work order"}: ` +
          `${line.description ?? line.complaint ?? "Approved line"} ` +
          `has been approved for ${hours.toFixed(1)} hours with no technician assigned.`,
        href: line.work_order_id
          ? `/work-orders/${line.work_order_id}/focused-job/${line.id}`
          : undefined,
        entityType: "work_order_line",
        entityId: line.id,
        createdAt: since ?? undefined,
        evidence: {
          hoursApproved: hours,
          thresholdHours: UNASSIGNED_APPROVED_WORK_HOURS,
          approvalState: line.approval_state,
          lineStatus: line.line_status,
        },
      });
    }
  }

  // Quoted parts awaiting advisor review: a supplier/vendor quote has come
  // back (status "quoted") but nobody has moved it forward yet. When an
  // item is linked to a canonical quote line, the advisor may have already
  // sent that quote to the customer — part_request_items.status stays
  // "quoted" regardless, so the linked quote line's own status is the
  // durable signal of whether the advisor has actually acted.
  const quoteLineIdsToCheck = [
    ...new Set(
      quotedItems
        .map((item) => item.quote_line_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const reviewedQuoteLineIds = new Set<string>();
  if (quoteLineIdsToCheck.length > 0) {
    const { data: linkedQuoteLines, error: linkedQuoteLinesError } = await supabase
      .from("work_order_quote_lines")
      .select("id, status")
      .eq("shop_id", shopId)
      .in("id", quoteLineIdsToCheck);

    if (linkedQuoteLinesError) {
      throw new Error(linkedQuoteLinesError.message);
    }

    for (const row of linkedQuoteLines ?? []) {
      if (!QUOTE_LINE_UNREVIEWED_STATUSES.has(String(row.status ?? "").toLowerCase())) {
        reviewedQuoteLineIds.add(row.id);
      }
    }
  }

  for (const item of quotedItems) {
    if (item.quote_line_id && reviewedQuoteLineIds.has(item.quote_line_id)) {
      continue;
    }

    const since = item.updated_at ?? item.created_at;
    const hours = ageHours(since);
    if (hours == null || hours < QUOTED_PARTS_REVIEW_HOURS) continue;

    notifications.push({
      level: "warning",
      code: "parts_quote_awaiting_review",
      title: "Parts quote awaiting review",
      message: `${item.description ?? "A parts quote"} has been waiting for advisor review for ${hours.toFixed(1)} hours.`,
      href: item.request_id ? `/parts/requests/${item.request_id}` : undefined,
      entityType: "part_request_item",
      entityId: item.id,
      createdAt: since ?? undefined,
      evidence: {
        hoursWaiting: hours,
        thresholdHours: QUOTED_PARTS_REVIEW_HOURS,
        quotedPrice: item.quoted_price,
        workOrderId: item.work_order_id,
      },
    });
  }

  // Parts received while the job remains waiting: the specific blocker a
  // line is waiting on (missing parts) is gone, but the line hasn't
  // resumed — cross-referenced against waitingOnPartsLineIds, the
  // canonical parts-specific hold state, rather than a second
  // work_order_lines scan.
  //
  // Two or more items can be received against the same still-waiting
  // line; only the earliest is kept so at most one notification is ever
  // computed per line — two would share the same fingerprint
  // (code + entityType + entityId + href) and collide in the persisted
  // upsert batch.
  const earliestReceivedItemByWaitingLineId = new Map<string, PartRequestItemRow>();
  for (const item of receivedItems) {
    if (
      !item.work_order_line_id ||
      !waitingOnPartsLineIds.has(item.work_order_line_id)
    ) {
      continue;
    }

    const existing = earliestReceivedItemByWaitingLineId.get(item.work_order_line_id);
    if (!existing) {
      earliestReceivedItemByWaitingLineId.set(item.work_order_line_id, item);
      continue;
    }

    const existingSince = existing.updated_at ?? existing.created_at;
    const itemSince = item.updated_at ?? item.created_at;
    if (itemSince && (!existingSince || itemSince < existingSince)) {
      earliestReceivedItemByWaitingLineId.set(item.work_order_line_id, item);
    }
  }

  for (const item of earliestReceivedItemByWaitingLineId.values()) {
    const since = item.updated_at ?? item.created_at;
    const hours = ageHours(since);
    if (hours == null || hours < PARTS_RECEIVED_JOB_WAITING_HOURS) continue;

    notifications.push({
      level: "urgent",
      code: "parts_received_job_waiting",
      title: "Parts arrived — job still on hold",
      message: `${item.description ?? "A required part"} arrived ${hours.toFixed(1)} hours ago, but the job hasn't resumed.`,
      href: item.work_order_line_id
        ? `/work-orders/${item.work_order_id ?? ""}/focused-job/${item.work_order_line_id}`
        : undefined,
      entityType: "work_order_line",
      entityId: item.work_order_line_id ?? undefined,
      createdAt: since ?? undefined,
      evidence: {
        hoursSinceReceived: hours,
        thresholdHours: PARTS_RECEIVED_JOB_WAITING_HOURS,
        partRequestItemId: item.id,
        status: item.status,
      },
    });
  }

  // Completed work awaiting closeout or invoicing: distinct from
  // invoice_unsent_too_long, which only fires once an invoice record
  // already exists — this catches the earlier gap where a work order has
  // been marked completed but hasn't even progressed to ready-to-invoice.
  for (const row of completedWoRows) {
    const hours = ageHours(row.updated_at);
    if (hours == null || hours < COMPLETED_AWAITING_CLOSEOUT_HOURS) continue;

    notifications.push({
      level: "warning",
      code: "work_order_completed_awaiting_closeout",
      title: "Completed work awaiting closeout",
      message: `${woLabel(row.custom_id, row.id)} has been completed for ${hours.toFixed(1)} hours without moving to invoicing.`,
      href: `/work-orders/${row.id}`,
      entityType: "work_order",
      entityId: row.id,
      createdAt: row.updated_at ?? undefined,
      evidence: {
        hoursCompleted: hours,
        thresholdHours: COMPLETED_AWAITING_CLOSEOUT_HOURS,
      },
    });
  }

  // Day-of appointment readiness (Phase 6): once a booking's scheduled day
  // arrives, surface whether the Phase 4 preparation projection found
  // anything that still needs attention before the vehicle shows up —
  // missing vehicle/customer info, or a matched repair whose required
  // parts are short. This only reads the existing projection; it never
  // creates or edits the projection, a work order, or a parts request.
  // A booking with nothing outstanding produces no notification — the
  // read-only projection list already covers the "all clear" case on
  // demand, so this stays reserved for what needs a human to act on it.
  for (const row of dayOfPreparationRows) {
    const missingInfo = (row.missing_info ?? []) as AppointmentMissingInfoFlag[];
    const matchedMenuItems = (row.matched_menu_items ??
      []) as AppointmentMatchedMenuItem[];
    const vehicleSnapshot = (row.vehicle_snapshot ??
      null) as AppointmentVehicleSnapshot | null;

    // Same verdict rule as the staff-facing preparation list
    // (AppointmentPreparationList's partsReadinessSummary): an optional
    // part being short shouldn't flag a repair that doesn't actually need
    // it — only required lines decide, falling back to every line when
    // none are marked required.
    const allPartsLines = matchedMenuItems.flatMap((item) => item.partsReadiness);
    const requiredPartsLines = allPartsLines.filter((line) => line.isRequired);
    const decisivePartsLines =
      requiredPartsLines.length > 0 ? requiredPartsLines : allPartsLines;
    const partsShort = decisivePartsLines.some((line) => line.status === "short");

    if (missingInfo.length === 0 && !partsShort) continue;

    const vehicleLabel =
      [vehicleSnapshot?.year, vehicleSnapshot?.make, vehicleSnapshot?.model]
        .filter(Boolean)
        .join(" ") ||
      vehicleSnapshot?.vin ||
      "Today's appointment";

    const issues: string[] = [];
    if (missingInfo.length > 0) {
      issues.push(
        missingInfo.map((flag) => MISSING_INFO_ISSUE_LABELS[flag] ?? flag).join(", "),
      );
    }
    if (partsShort) {
      issues.push("required parts are short for the matched repair");
    }

    const hrefParams = new URLSearchParams({ bookingId: row.booking_id });
    if (row.vehicle_id) hrefParams.set("vehicleId", row.vehicle_id);

    notifications.push({
      level: "warning",
      code: "appointment_day_of_readiness",
      title: "Today's appointment needs attention",
      message: `${vehicleLabel} is booked for today and ${issues.join("; ")}.`,
      href: `/work-orders/create?${hrefParams.toString()}`,
      entityType: "booking",
      entityId: row.booking_id,
      createdAt: row.starts_at,
      evidence: {
        startsAt: row.starts_at,
        missingInfo,
        partsShort,
      },
    });
  }

  const loadMetrics = await getTechnicianLoadMetricsWithClient(supabase, shopId);
  const shiftedTechs = loadMetrics.rows.filter((row) => row.shiftSecondsToday > 0);
  const overloadedTechs = shiftedTechs.filter(
    (row) =>
      row.utilizationPct >= TECH_OVERLOAD_UTILIZATION_PCT ||
      row.currentActiveJobs >= TECH_OVERLOAD_ACTIVE_JOBS,
  );

  for (const row of overloadedTechs) {
    notifications.push({
      level: "warning",
      code: "tech_overloaded",
      title: "Technician overloaded",
      message: `${row.name} is at ${row.utilizationPct}% utilization with ${row.currentActiveJobs} active job(s). Rebalance upcoming work.`,
      href: "/dashboard",
      entityType: "profile",
      entityId: row.techId,
      evidence: {
        techId: row.techId,
        utilizationPct: row.utilizationPct,
        activeJobs: row.currentActiveJobs,
        thresholdUtilizationPct: TECH_OVERLOAD_UTILIZATION_PCT,
        thresholdActiveJobs: TECH_OVERLOAD_ACTIVE_JOBS,
      },
    });
  }

  if (
    loadMetrics.summary.shopUtilizationPct >= SHOP_OVERLOAD_UTILIZATION_PCT &&
    loadMetrics.summary.totalActiveJobs >= Math.max(2, loadMetrics.summary.totalTechnicians)
  ) {
    notifications.push({
      level: "urgent",
      code: "shop_overloaded",
      title: "Shop overloaded",
      message: `Shop load is ${loadMetrics.summary.shopUtilizationPct}% with ${loadMetrics.summary.totalActiveJobs} active jobs across ${loadMetrics.summary.totalTechnicians} technicians.`,
      href: "/dashboard",
      entityType: "shop",
      entityId: shopId,
      evidence: {
        shopUtilizationPct: loadMetrics.summary.shopUtilizationPct,
        totalActiveJobs: loadMetrics.summary.totalActiveJobs,
        totalTechnicians: loadMetrics.summary.totalTechnicians,
        thresholdUtilizationPct: SHOP_OVERLOAD_UTILIZATION_PCT,
      },
    });
  }

  const underutilizedTechs = shiftedTechs.filter(
    (row) => row.currentActiveJobs === 0 && row.utilizationPct <= SHOP_UNDERUTILIZATION_PCT,
  );
  if (
    loadMetrics.summary.shopUtilizationPct <= SHOP_UNDERUTILIZATION_PCT &&
    underutilizedTechs.length > 0
  ) {
    notifications.push({
      level: "info",
      code: "tech_underutilized_capacity",
      title: "Underutilized technician capacity",
      message: `${underutilizedTechs.length} technician(s) have shift time available but no active jobs. Pull queued work forward.`,
      href: "/dashboard",
      entityType: "shop",
      entityId: shopId,
      evidence: {
        underutilizedTechIds: underutilizedTechs.map((row) => row.techId),
        shopUtilizationPct: loadMetrics.summary.shopUtilizationPct,
        thresholdUtilizationPct: SHOP_UNDERUTILIZATION_PCT,
      },
    });
  }

  const completedJobs = shiftedTechs.reduce((sum, row) => sum + row.completedJobsToday, 0);
  const elapsedHours = Math.max(
    0,
    (Date.now() - new Date(loadMetrics.dayStartIso).getTime()) / (1000 * 60 * 60),
  );
  const completedPerShiftedTech =
    shiftedTechs.length > 0 ? completedJobs / shiftedTechs.length : 0;

  if (
    elapsedHours >= LOW_THROUGHPUT_MIN_ELAPSED_HOURS &&
    shiftedTechs.length >= LOW_THROUGHPUT_MIN_SHIFTED_TECHS &&
    loadMetrics.summary.shopUtilizationPct >= 55 &&
    completedPerShiftedTech < LOW_THROUGHPUT_MAX_COMPLETIONS_PER_TECH
  ) {
    notifications.push({
      level: "warning",
      code: "shop_throughput_below_capacity",
      title: "Low throughput vs current shift capacity",
      message: `${shiftedTechs.length} shifted tech(s) have completed ${completedJobs} jobs so far (${completedPerShiftedTech.toFixed(1)} each) while utilization is ${loadMetrics.summary.shopUtilizationPct}%. Check blockers and handoffs.`,
      href: "/dashboard",
      entityType: "shop",
      entityId: shopId,
      evidence: {
        shiftedTechCount: shiftedTechs.length,
        completedJobs,
        completedPerShiftedTech,
        elapsedHours,
        shopUtilizationPct: loadMetrics.summary.shopUtilizationPct,
      },
    });
  }

  try {
    const optimization = await buildOptimizationOpportunities({
      supabase,
      shopId,
      lookbackDays: 365,
      limit: 8,
    });
    const opportunities = optimization.groups.flatMap((group) => group.opportunities ?? []);
    const selected = opportunities
      .filter(
        (item) =>
          item.priorityBand === "critical" ||
          item.priorityBand === "high" ||
          (item.priorityBand === "medium" && item.confidence >= 0.72),
      )
      .slice(0, 3);

    for (const item of selected) {
      const explanation = item.explanation?.operational;
      notifications.push({
        level: item.priorityBand === "critical" ? "urgent" : "warning",
        code: toOptimizationCode(item.type),
        title: item.title,
        message: [
          explanation?.summary ?? item.summary,
          explanation?.riskIfIgnored ? `If deferred: ${explanation.riskIfIgnored}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        href: optimizationHref(item),
        entityType: "optimization_opportunity",
        entityId: item.id,
        createdAt: optimization.generatedAt,
        evidence: {
          opportunityId: item.id,
          opportunityType: item.type,
          priorityBand: item.priorityBand,
          confidence: item.confidence,
        },
      });
    }
  } catch (error) {
    console.warn("[ops notifications] optimization enrichment skipped", error);
  }

  const [{ count: menuSuggestionCount }, { count: inspectionSuggestionCount }] =
    await Promise.all([
      supabase
        .from("menu_item_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId),
      supabase
        .from("inspection_template_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId),
    ]);

  const totalQueuedSuggestions =
    (menuSuggestionCount ?? 0) + (inspectionSuggestionCount ?? 0);
  if (totalQueuedSuggestions > 0) {
    notifications.push({
      level: totalQueuedSuggestions >= 6 ? "warning" : "info",
      code: "optimization_review_queued_suggestions",
      title: "Queued ShopBoost suggestions need review",
      message: `${menuSuggestionCount ?? 0} service suggestions and ${inspectionSuggestionCount ?? 0} inspection suggestions are waiting for approval.`,
      href: "/menu_item_suggestions",
      entityType: "shop",
      entityId: shopId,
      evidence: {
        menuSuggestionCount: menuSuggestionCount ?? 0,
        inspectionSuggestionCount: inspectionSuggestionCount ?? 0,
      },
    });
  }

  notifications.sort((a, b) => {
    const levelRank = (level: OpsNotificationLevel): number =>
      level === "urgent" ? 3 : level === "warning" ? 2 : 1;

    const levelDelta = levelRank(b.level) - levelRank(a.level);
    if (levelDelta !== 0) return levelDelta;

    const actionableDelta =
      Number(Boolean(b.href || b.entityId)) - Number(Boolean(a.href || a.entityId));
    if (actionableDelta !== 0) return actionableDelta;

    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return notifications;
}
