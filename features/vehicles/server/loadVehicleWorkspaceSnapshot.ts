import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@shared/types/types/supabase";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  formatOperationalLabel,
  isEstimateRecord,
  normalizeWorkOrderStatus,
} from "@/features/work-orders/lib/work-order-status";
import type { MaintenanceSuggestionItem } from "@/features/maintenance/server/types";
import {
  createWorkOrderHandoffHref,
  customerAccountDisplayName,
  vehicleIdentityLabel,
  type ActiveWorkSummary,
  type AppointmentSummary,
  type CustomerAccountSummary,
  type RelatedVehicleSummary,
  type VehicleAttentionItem,
  type VehicleDocumentSummary,
  type VehicleFinancialSummary,
  type VehicleIdentity,
  type VehicleTimelineEvent,
  type VehicleWorkspaceConflict,
  type VehicleWorkspaceReference,
  type VehicleWorkspaceSnapshot,
} from "@/features/vehicles/lib/vehicleWorkspace";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";

type DB = Database;
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type BookingRow = DB["public"]["Tables"]["bookings"]["Row"];
type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];
type HistoryRow = DB["public"]["Tables"]["history"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type PaymentRow = DB["public"]["Tables"]["payments"]["Row"];
type PartRequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type VehicleMediaRow = DB["public"]["Tables"]["vehicle_media"]["Row"];
type WorkOrderMediaRow = DB["public"]["Tables"]["work_order_media"]["Row"];
type MaintenanceSuggestionRow =
  DB["public"]["Tables"]["maintenance_suggestions"]["Row"];

type WorkspaceVehicleRow = Pick<
  VehicleRow,
  | "id"
  | "shop_id"
  | "customer_id"
  | "year"
  | "make"
  | "model"
  | "submodel"
  | "vin"
  | "license_plate"
  | "unit_number"
  | "mileage"
  | "odometer_unit"
  | "engine_hours"
  | "status"
>;

type WorkspaceCustomerRow = Pick<
  CustomerRow,
  | "id"
  | "account_type"
  | "active"
  | "business_name"
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "phone_number"
  | "archived_at"
  | "merged_into_customer_id"
>;

type WorkspaceWorkOrderRow = Pick<
  WorkOrderRow,
  | "id"
  | "customer_id"
  | "vehicle_id"
  | "custom_id"
  | "status"
  | "record_type"
  | "approval_state"
  | "estimate_number"
  | "estimate_status"
  | "scheduled_at"
  | "odometer_km"
  | "created_at"
  | "updated_at"
>;

type WorkspaceWorkOrderLineRow = Pick<
  WorkOrderLineRow,
  | "id"
  | "work_order_id"
  | "description"
  | "complaint"
  | "correction"
  | "hold_reason"
  | "status"
  | "line_status"
  | "approval_state"
  | "urgency"
  | "voided_at"
  | "created_at"
  | "updated_at"
>;

type WorkspaceWorkOrderPartRow = Pick<
  WorkOrderPartRow,
  | "id"
  | "work_order_id"
  | "work_order_line_id"
  | "description_snapshot"
  | "manufacturer_snapshot"
  | "part_number_snapshot"
  | "sku_snapshot"
  | "quantity_consumed"
  | "quantity_returned"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

type WorkspaceQuoteLineRow = Pick<
  QuoteLineRow,
  | "id"
  | "work_order_id"
  | "work_order_line_id"
  | "source_work_order_line_id"
  | "description"
  | "title"
  | "status"
  | "decision"
  | "defer_reason"
  | "decline_reason"
  | "approved_at"
  | "deferred_at"
  | "declined_at"
  | "created_at"
  | "updated_at"
>;

type WorkspaceBookingRow = Pick<
  BookingRow,
  | "id"
  | "work_order_id"
  | "starts_at"
  | "ends_at"
  | "status"
  | "notes"
  | "created_at"
>;

type WorkspaceInspectionRow = Pick<
  InspectionRow,
  | "id"
  | "work_order_id"
  | "work_order_line_id"
  | "inspection_type"
  | "status"
  | "completed"
  | "summary"
  | "created_at"
  | "started_at"
  | "finalized_at"
  | "updated_at"
  | "pdf_url"
  | "pdf_storage_path"
>;

type WorkspaceHistoryRow = Pick<
  HistoryRow,
  | "id"
  | "customer_id"
  | "work_order_id"
  | "work_order_number"
  | "historical_status"
  | "description"
  | "odometer"
  | "service_date"
  | "opened_at"
  | "closed_at"
  | "source_system"
>;

type WorkspaceInvoiceRow = Pick<
  InvoiceRow,
  | "id"
  | "work_order_id"
  | "invoice_number"
  | "status"
  | "currency"
  | "total"
  | "outstanding_total"
  | "paid_total"
  | "created_at"
  | "issued_at"
  | "paid_at"
  | "updated_at"
>;

type WorkspacePaymentRow = Pick<
  PaymentRow,
  | "id"
  | "work_order_id"
  | "status"
  | "amount"
  | "currency"
  | "paid_at"
  | "created_at"
>;

type WorkspacePartRequestRow = Pick<
  PartRequestRow,
  "id" | "work_order_id" | "status" | "notes" | "created_at"
>;

type WorkspaceVehicleMediaRow = Pick<
  VehicleMediaRow,
  "id" | "type" | "filename" | "created_at"
>;

type WorkspaceWorkOrderMediaRow = Pick<
  WorkOrderMediaRow,
  "id" | "work_order_id" | "kind" | "file_name" | "created_at"
>;

const TERMINAL_WORK_ORDER_STATUSES = new Set([
  "archived",
  "canceled",
  "cancelled",
  "closed",
  "completed",
  "invoiced",
  "paid",
  "void",
  "voided",
]);
const OPEN_INSPECTION_STATUSES = new Set([
  "not_started",
  "in_progress",
  "paused",
  "draft",
  "open",
]);
const TERMINAL_APPOINTMENT_STATUSES = new Set([
  "canceled",
  "cancelled",
  "completed",
]);
const TERMINAL_PART_REQUEST_STATUSES = new Set([
  "canceled",
  "cancelled",
  "fulfilled",
  "rejected",
  "returned",
]);
const ACTIVE_ESTIMATE_STATUSES = new Set([
  "draft",
  "waiting_for_parts",
  "ready_for_advisor",
  "sent",
  "partially_approved",
]);
const DEFERRED_LINE_STATES = new Set([
  "deferred",
  "declined",
  "customer_deferred",
  "customer_declined",
]);
const WAITING_PARTS_LINE_STATES = new Set([
  "awaiting_parts",
  "on_hold",
  "parts_needed",
  "waiting_parts",
]);
const PENDING_CONCERN_STATES = new Set([
  "awaiting",
  "awaiting_approval",
  "pending",
]);
const QUOTE_DECISION_STATES = new Set([
  "approved",
  "declined",
  "deferred",
  "customer_approved",
  "customer_declined",
  "customer_deferred",
]);
const TERMINAL_LINE_STATES = new Set([
  "canceled",
  "cancelled",
  "completed",
  "invoiced",
  "ready_to_invoice",
  "voided",
]);
const QUERY_PAGE_SIZE = 500;
const WORK_ORDER_ID_CHUNK_SIZE = 100;
const MAX_QUERY_PAGES = 100;
const UPCOMING_APPOINTMENT_LIMIT = 40;

type QueryPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function collectAllPages<T>(
  context: string,
  loadPage: (from: number, to: number) => Promise<QueryPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
    const from = page * QUERY_PAGE_SIZE;
    const result = await loadPage(from, from + QUERY_PAGE_SIZE - 1);
    throwQueryError(result.error, context);
    const pageRows = result.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < QUERY_PAGE_SIZE) return rows;
  }

  throw new Error(`${context}: query exceeded the safe pagination limit`);
}

function chunkWorkOrderIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += WORK_ORDER_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + WORK_ORDER_ID_CHUNK_SIZE));
  }
  return chunks;
}

async function collectWorkOrderScopedRows<T>(
  context: string,
  workOrderIds: readonly string[],
  loadPage: (
    ids: string[],
    from: number,
    to: number,
  ) => Promise<QueryPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (const ids of chunkWorkOrderIds(workOrderIds)) {
    rows.push(
      ...(await collectAllPages(context, (from, to) =>
        loadPage(ids, from, to),
      )),
    );
  }
  return rows;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedOperationalState(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function quoteLineIsDeferred(row: WorkspaceQuoteLineRow): boolean {
  return DEFERRED_LINE_STATES.has(
    normalizedOperationalState(row.decision ?? row.status),
  );
}

function workOrderIsEstimate(row: WorkspaceWorkOrderRow): boolean {
  return isEstimateRecord(row);
}

function estimateIsActionable(row: WorkspaceWorkOrderRow): boolean {
  return (
    workOrderIsEstimate(row) &&
    ACTIVE_ESTIMATE_STATUSES.has(
      normalizedOperationalState(row.estimate_status),
    )
  );
}

function workOrderIsTerminal(row: WorkspaceWorkOrderRow): boolean {
  return (
    TERMINAL_WORK_ORDER_STATUSES.has(normalizedOperationalState(row.status)) ||
    TERMINAL_WORK_ORDER_STATUSES.has(normalizeWorkOrderStatus(row.status))
  );
}

function dateValue(...values: Array<string | null | undefined>): string {
  return values.find((value): value is string => Boolean(value)) ?? new Date(0).toISOString();
}

function latestWorkOrderOdometer(
  workOrders: WorkspaceWorkOrderRow[],
): number | null {
  const newestReading = [...workOrders]
    .filter(
      (row) =>
        row.odometer_km !== null &&
        Number.isFinite(Number(row.odometer_km)),
    )
    .sort(
      (a, b) =>
        workOrderEvidenceTime(b) - workOrderEvidenceTime(a),
    )[0];
  return newestReading?.odometer_km ?? null;
}

function workOrderEvidenceTime(row: WorkspaceWorkOrderRow): number {
  // The canonical work-order schema has no odometer-captured timestamp.
  // created_at is the immutable intake boundary; scheduled_at is planning data
  // synchronized from bookings and must never reorder recorded evidence.
  const value = Date.parse(row.created_at ?? "");
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function workspaceVehicleIdentity(
  row: WorkspaceVehicleRow,
  workOrders: WorkspaceWorkOrderRow[] = [],
): VehicleIdentity {
  // vehicles.mileage has no source timestamp. A dated canonical WO reading is
  // therefore the newest provable value; the vehicle master value is fallback.
  const workOrderOdometer = latestWorkOrderOdometer(workOrders);
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    submodel: row.submodel,
    vin: row.vin,
    licensePlate: row.license_plate,
    unitNumber: row.unit_number,
    mileage:
      workOrderOdometer === null ? row.mileage : String(workOrderOdometer),
    odometerUnit:
      workOrderOdometer === null ? row.odometer_unit : "km",
    engineHours: row.engine_hours,
    status: row.status,
  };
}

function workOrderLabel(row: WorkspaceWorkOrderRow): string {
  return row.custom_id ? `WO-${row.custom_id.replace(/^wo-?/i, "")}` : `WO ${row.id.slice(0, 8)}`;
}

function workOrderReference(row: WorkspaceWorkOrderRow): VehicleWorkspaceReference {
  const isEstimate = workOrderIsEstimate(row);
  const sourceLabel = isEstimate
    ? row.estimate_number
      ? `Estimate ${row.estimate_number}`
      : `Estimate ${row.id.slice(0, 8)}`
    : workOrderLabel(row);
  return {
    sourceType: "work_order",
    sourceId: row.id,
    sourceLabel,
    href: isEstimate ? `/estimates/${row.id}` : `/work-orders/${row.id}`,
  };
}

function lineReference(row: WorkspaceWorkOrderLineRow): VehicleWorkspaceReference {
  return {
    sourceType: "work_order_line",
    sourceId: row.id,
    sourceLabel: `Repair line ${row.id.slice(0, 8)}`,
    href: `/work-orders/${row.work_order_id}/focused-job/${row.id}`,
  };
}

function quoteLineReference(
  row: WorkspaceQuoteLineRow,
): VehicleWorkspaceReference {
  return {
    sourceType: "work_order_quote_line",
    sourceId: row.id,
    sourceLabel: `Estimate item ${row.id.slice(0, 8)}`,
    href: `/estimates/${row.work_order_id}`,
  };
}

function workOrderPartReference(
  row: WorkspaceWorkOrderPartRow,
): VehicleWorkspaceReference {
  return {
    sourceType: "work_order_part",
    sourceId: row.id,
    sourceLabel: `Installed part ${row.id.slice(0, 8)}`,
    href: row.work_order_line_id
      ? `/work-orders/${row.work_order_id}/focused-job/${row.work_order_line_id}`
      : `/work-orders/${row.work_order_id}`,
  };
}

function workOrderPartLabel(row: WorkspaceWorkOrderPartRow): string {
  const manufacturerAndNumber = [
    text(row.manufacturer_snapshot),
    text(row.part_number_snapshot),
  ]
    .filter(Boolean)
    .join(" ");
  return (
    text(row.description_snapshot) ??
    text(manufacturerAndNumber) ??
    text(row.sku_snapshot) ??
    `Part ${row.id.slice(0, 8)}`
  );
}

function installedPartQuantity(row: WorkspaceWorkOrderPartRow): number {
  return Number(row.quantity_consumed ?? 0) - Number(row.quantity_returned ?? 0);
}

function inspectionReference(row: WorkspaceInspectionRow): VehicleWorkspaceReference {
  return {
    sourceType: "inspection",
    sourceId: row.id,
    sourceLabel: row.inspection_type?.trim() || `Inspection ${row.id.slice(0, 8)}`,
    href: `/inspections/${row.id}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type InspectionFinding = {
  key: string;
  label: string;
  section: string | null;
  status: "fail" | "recommend";
  note: string | null;
  measurement: string | null;
};

function findingFromRecord(
  value: unknown,
  index: number,
  fallbackSection: string | null,
): InspectionFinding | null {
  if (!isRecord(value)) return null;
  const normalizedStatus = String(value.status ?? "").trim().toLowerCase();
  if (normalizedStatus !== "fail" && normalizedStatus !== "recommend") return null;

  const label = text(value.item) ?? text(value.name) ?? text(value.label) ?? `Finding ${index + 1}`;
  const section = text(value.section) ?? fallbackSection;
  const rawValue = text(value.value);
  const unit = text(value.unit);

  return {
    key: `${section ?? "inspection"}:${label}:${index}`,
    label,
    section,
    status: normalizedStatus,
    note: text(value.note) ?? text(value.notes),
    measurement: rawValue ? `${rawValue}${unit ? ` ${unit}` : ""}` : null,
  };
}

export function extractInspectionFindings(summary: Json | null): InspectionFinding[] {
  if (!isRecord(summary)) return [];
  const findings: InspectionFinding[] = [];

  if (Array.isArray(summary.items)) {
    summary.items.forEach((item, index) => {
      const finding = findingFromRecord(item, index, null);
      if (finding) findings.push(finding);
    });
  }

  if (Array.isArray(summary.sections)) {
    summary.sections.forEach((sectionValue) => {
      if (!isRecord(sectionValue) || !Array.isArray(sectionValue.items)) return;
      const section = text(sectionValue.title) ?? text(sectionValue.name);
      sectionValue.items.forEach((item, index) => {
        const finding = findingFromRecord(item, index, section);
        if (finding) findings.push(finding);
      });
    });
  }

  return findings;
}

function isMaintenanceSuggestionItem(value: unknown): value is MaintenanceSuggestionItem {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.serviceCode === "string" &&
    value.dueNow === true &&
    value.suppressed !== true &&
    typeof value.whyDue === "string" &&
    value.whyDue.trim().length > 0
  );
}

function maintenanceItems(row: MaintenanceSuggestionRow): MaintenanceSuggestionItem[] {
  return Array.isArray(row.suggestions)
    ? row.suggestions.filter(isMaintenanceSuggestionItem)
    : [];
}

function buildAttentionItems(input: {
  workOrdersById: Map<string, WorkspaceWorkOrderRow>;
  lines: WorkspaceWorkOrderLineRow[];
  quoteLines: WorkspaceQuoteLineRow[];
  inspections: WorkspaceInspectionRow[];
  maintenance: MaintenanceSuggestionRow[];
}): VehicleAttentionItem[] {
  const items: VehicleAttentionItem[] = [];
  const representedMaintenanceServices = new Set<string>();
  const representedLineIds = new Set(
    input.quoteLines
      .filter(quoteLineIsDeferred)
      .flatMap((line) =>
        [line.work_order_line_id, line.source_work_order_line_id].filter(
          (id): id is string => Boolean(id),
        ),
      ),
  );

  for (const quoteLine of input.quoteLines) {
    const status = normalizedOperationalState(
      quoteLine.decision ?? quoteLine.status,
    );
    if (!quoteLineIsDeferred(quoteLine)) continue;
    const workOrder = input.workOrdersById.get(quoteLine.work_order_id);
    const reason = quoteLine.defer_reason ?? quoteLine.decline_reason;
    items.push({
      kind: "deferred_work",
      title: quoteLine.title?.trim() || quoteLine.description.trim(),
      explanation: [
        status.includes("defer") ? "Deferred" : "Declined",
        workOrder ? `from ${workOrderLabel(workOrder)}` : null,
        text(reason),
      ]
        .filter(Boolean)
        .join(" · "),
      severity: "warning",
      occurredAt: quoteLine.deferred_at ?? quoteLine.declined_at ?? quoteLine.updated_at,
      reference: quoteLineReference(quoteLine),
    });
  }

  for (const line of input.lines) {
    if (representedLineIds.has(line.id)) continue;
    if (line.voided_at) continue;
    const states = [line.line_status, line.status, line.approval_state]
      .map(normalizedOperationalState)
      .filter(Boolean);
    if (states.some((state) => TERMINAL_LINE_STATES.has(state))) continue;
    const isDeferred = states.some((state) => DEFERRED_LINE_STATES.has(state));
    const isWaitingParts =
      !isDeferred &&
      (states.some((state) => WAITING_PARTS_LINE_STATES.has(state)) ||
        Boolean(text(line.hold_reason)));
    const isConcern =
      !isDeferred &&
      !isWaitingParts &&
      states.some((state) => PENDING_CONCERN_STATES.has(state)) &&
      Boolean(text(line.complaint));
    if (!isDeferred && !isWaitingParts && !isConcern) continue;
    const workOrder = input.workOrdersById.get(line.work_order_id);
    const title = text(line.description) ?? text(line.complaint) ?? "Repair item";
    items.push({
      kind: isDeferred
        ? "deferred_work"
        : isWaitingParts
          ? "waiting_parts"
          : "unresolved_concern",
      title,
      explanation: [
        isWaitingParts ? text(line.hold_reason) ?? "Waiting for parts" : null,
        workOrder ? `Recorded on ${workOrderLabel(workOrder)}` : "Recorded repair line",
        isConcern ? text(line.complaint) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      severity: isWaitingParts || isDeferred ? "warning" : "info",
      occurredAt: line.updated_at ?? line.created_at,
      reference: lineReference(line),
    });
  }

  for (const inspection of input.inspections) {
    for (const finding of extractInspectionFindings(inspection.summary)) {
      const detail = [
        finding.measurement,
        finding.note,
        `recorded during ${inspectionReference(inspection).sourceLabel}`,
      ]
        .filter(Boolean)
        .join(" · ");
      items.push({
        kind: "failed_inspection",
        title: [finding.section, finding.label].filter(Boolean).join(" — "),
        explanation: detail,
        severity: finding.status === "fail" ? "urgent" : "warning",
        occurredAt: dateValue(
          inspection.finalized_at,
          inspection.updated_at,
          inspection.created_at,
        ),
        reference: inspectionReference(inspection),
      });
    }
  }

  for (const suggestionRow of input.maintenance) {
    const workOrder = input.workOrdersById.get(suggestionRow.work_order_id);
    for (const suggestion of maintenanceItems(suggestionRow)) {
      const maintenanceKey = normalizedOperationalState(
        suggestion.serviceCode || suggestion.label,
      );
      if (representedMaintenanceServices.has(maintenanceKey)) continue;
      representedMaintenanceServices.add(maintenanceKey);
      items.push({
        kind: "maintenance_due",
        title: suggestion.label,
        explanation: [
          suggestion.whyDue,
          workOrder ? `evaluated for ${workOrderLabel(workOrder)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        severity: suggestion.isCritical || suggestion.overdue ? "urgent" : "warning",
        occurredAt: suggestionRow.updated_at,
        reference: {
          sourceType: "maintenance_suggestion",
          sourceId: suggestionRow.work_order_id,
          sourceLabel: `Maintenance evidence for ${workOrder ? workOrderLabel(workOrder) : suggestionRow.work_order_id.slice(0, 8)}`,
          href: `/work-orders/${suggestionRow.work_order_id}`,
        },
      });
    }
  }

  return items.sort(
    (a, b) =>
      new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime(),
  );
}

function buildTimeline(input: {
  workOrders: WorkspaceWorkOrderRow[];
  bookings: WorkspaceBookingRow[];
  inspections: WorkspaceInspectionRow[];
  lines: WorkspaceWorkOrderLineRow[];
  parts: WorkspaceWorkOrderPartRow[];
  quoteLines: WorkspaceQuoteLineRow[];
  history: WorkspaceHistoryRow[];
  invoices: WorkspaceInvoiceRow[];
  payments: WorkspacePaymentRow[];
}): VehicleTimelineEvent[] {
  const events: VehicleTimelineEvent[] = [];
  const workOrderIds = new Set(input.workOrders.map((row) => row.id));

  for (const row of input.workOrders) {
    const isEstimate = workOrderIsEstimate(row);
    const odometer =
      row.odometer_km === null ? null : `Odometer: ${row.odometer_km} km`;
    events.push({
      kind: isEstimate ? "estimate" : "work_order",
      title:
        isEstimate
          ? row.estimate_number
            ? `Estimate ${row.estimate_number}`
            : `Estimate ${row.id.slice(0, 8)}`
          : workOrderLabel(row),
      detail:
        [
          isEstimate
            ? row.estimate_status
              ? formatOperationalLabel(row.estimate_status)
              : null
            : row.status
              ? formatOperationalLabel(row.status)
              : null,
          odometer,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      occurredAt: dateValue(row.updated_at, row.created_at),
      reference: workOrderReference(row),
    });
  }

  for (const row of input.bookings) {
    events.push({
      kind: "appointment",
      title: "Appointment",
      detail:
        [row.status ? formatOperationalLabel(row.status) : null, text(row.notes)]
          .filter(Boolean)
          .join(" · ") || null,
      occurredAt: row.starts_at,
      reference: {
        sourceType: "appointment",
        sourceId: row.id,
        sourceLabel: `Appointment ${row.id.slice(0, 8)}`,
        href: `/dashboard/appointments?bookingId=${encodeURIComponent(row.id)}`,
      },
    });
  }

  for (const row of input.inspections) {
    events.push({
      kind: "inspection",
      title: inspectionReference(row).sourceLabel,
      detail: row.status ? formatOperationalLabel(row.status) : null,
      occurredAt: dateValue(row.finalized_at, row.updated_at, row.started_at, row.created_at),
      reference: inspectionReference(row),
    });
  }

  for (const row of input.lines) {
    const status = String(row.line_status ?? row.status).toLowerCase();
    if (!["completed", "ready_to_invoice", "invoiced"].includes(status)) continue;
    events.push({
      kind: "repair",
      title: text(row.description) ?? text(row.correction) ?? "Repair completed",
      detail: formatOperationalLabel(status),
      occurredAt: dateValue(row.updated_at, row.created_at),
      reference: lineReference(row),
    });
  }

  for (const row of input.parts) {
    const quantity = installedPartQuantity(row);
    if (
      !row.is_active ||
      !workOrderIds.has(row.work_order_id) ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      continue;
    }
    events.push({
      kind: "part",
      title: workOrderPartLabel(row),
      detail: `Installed quantity: ${quantity}`,
      occurredAt: dateValue(row.updated_at, row.created_at),
      reference: workOrderPartReference(row),
    });
  }

  for (const row of input.quoteLines) {
    const decision = normalizedOperationalState(row.decision);
    if (!QUOTE_DECISION_STATES.has(decision)) continue;
    const decisionAt = decision.includes("approved")
      ? row.approved_at
      : decision.includes("declined")
        ? row.declined_at
        : row.deferred_at;
    events.push({
      kind: "approval",
      title:
        text(row.title) ?? text(row.description) ?? "Estimate item decision",
      detail: `Decision: ${formatOperationalLabel(decision)}`,
      occurredAt: dateValue(decisionAt, row.updated_at, row.created_at),
      reference: quoteLineReference(row),
    });
  }

  for (const row of input.history) {
    if (row.work_order_id && workOrderIds.has(row.work_order_id)) continue;
    events.push({
      kind: "history",
      title: row.work_order_number ? `Historical WO ${row.work_order_number}` : "Imported service history",
      detail: [
        row.description,
        row.historical_status,
        row.source_system,
        row.odometer === null ? null : `Odometer: ${row.odometer}`,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      occurredAt: dateValue(row.closed_at, row.opened_at, row.service_date),
      reference: {
        sourceType: "history",
        sourceId: row.id,
        sourceLabel: `History ${row.id.slice(0, 8)}`,
        href: `/work-orders/history/${row.id}`,
      },
    });
  }

  for (const row of input.invoices) {
    if (!row.work_order_id) continue;
    events.push({
      kind: "invoice",
      title: row.invoice_number ? `Invoice ${row.invoice_number}` : `Invoice ${row.id.slice(0, 8)}`,
      detail: row.status ? formatOperationalLabel(row.status) : null,
      occurredAt: dateValue(row.paid_at, row.issued_at, row.updated_at, row.created_at),
      reference: {
        sourceType: "invoice",
        sourceId: row.id,
        sourceLabel: row.invoice_number ? `Invoice ${row.invoice_number}` : `Invoice ${row.id.slice(0, 8)}`,
        href: `/work-orders/invoice/${row.work_order_id}`,
      },
    });
  }

  for (const row of input.payments) {
    if (!row.work_order_id) continue;
    events.push({
      kind: "payment",
      title: "Payment recorded",
      detail: row.status ? formatOperationalLabel(row.status) : null,
      occurredAt: dateValue(row.paid_at, row.created_at),
      reference: {
        sourceType: "payment",
        sourceId: row.id,
        sourceLabel: `Payment ${row.id.slice(0, 8)}`,
        href: `/work-orders/invoice/${row.work_order_id}`,
      },
    });
  }

  return events
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 20);
}

function buildFinancialSummary(invoices: WorkspaceInvoiceRow[]): VehicleFinancialSummary {
  if (invoices.length === 0) {
    return {
      visible: true,
      currency: null,
      invoiceCount: 0,
      outstandingAmount: null,
      paidAmount: null,
    };
  }

  const currencies = new Set(
    invoices.map((row) => text(row.currency)?.toUpperCase() ?? null),
  );
  const singleCurrency =
    currencies.size === 1 ? [...currencies][0] : null;
  if (!singleCurrency) {
    return {
      visible: true,
      currency: null,
      invoiceCount: invoices.length,
      outstandingAmount: null,
      paidAmount: null,
    };
  }

  return {
    visible: true,
    currency: singleCurrency,
    invoiceCount: invoices.length,
    outstandingAmount: invoices.reduce((sum, row) => sum + Number(row.outstanding_total ?? 0), 0),
    paidAmount: invoices.reduce((sum, row) => sum + Number(row.paid_total ?? 0), 0),
  };
}

function buildDocumentSummary(input: {
  vehicleMedia: WorkspaceVehicleMediaRow[];
  workOrderMedia: WorkspaceWorkOrderMediaRow[];
  inspections: WorkspaceInspectionRow[];
  workOrdersById: Map<string, WorkspaceWorkOrderRow>;
}): VehicleDocumentSummary {
  const reports = input.inspections
    .filter((row) => Boolean(row.pdf_url || row.pdf_storage_path))
    .sort((a, b) => {
      const evidenceOrder =
        inspectionReportEvidenceTime(b) - inspectionReportEvidenceTime(a);
      return evidenceOrder || b.id.localeCompare(a.id);
    });
  const newestWorkOrderMedia = [...input.workOrderMedia].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  )[0];

  return {
    vehicleMediaCount: input.vehicleMedia.length,
    workOrderMediaCount: input.workOrderMedia.length,
    inspectionReportCount: reports.length,
    latestReference: newestWorkOrderMedia
      ? {
          sourceType: "work_order_media",
          sourceId: newestWorkOrderMedia.id,
          sourceLabel: `${formatOperationalLabel(newestWorkOrderMedia.kind || "attachment")} from ${
            input.workOrdersById.has(newestWorkOrderMedia.work_order_id)
              ? workOrderLabel(input.workOrdersById.get(newestWorkOrderMedia.work_order_id)!)
              : "work order"
          }`,
          href: `/work-orders/${newestWorkOrderMedia.work_order_id}`,
        }
      : reports[0]
        ? inspectionReference(reports[0])
        : null,
  };
}

function inspectionReportEvidenceTime(row: WorkspaceInspectionRow): number {
  const timestamps = [row.finalized_at, row.updated_at, row.created_at]
    .map((value) => Date.parse(value ?? ""))
    .filter(Number.isFinite);
  return timestamps.length > 0
    ? Math.max(...timestamps)
    : Number.NEGATIVE_INFINITY;
}

function buildConflicts(input: {
  vehicle: WorkspaceVehicleRow;
  account: WorkspaceCustomerRow | null;
  workOrders: WorkspaceWorkOrderRow[];
  history: WorkspaceHistoryRow[];
}): VehicleWorkspaceConflict[] {
  const conflicts: VehicleWorkspaceConflict[] = [];
  const activeWorkOrders = input.workOrders.filter(
    (row) =>
      !workOrderIsEstimate(row) &&
      !workOrderIsTerminal(row),
  );

  if (!input.vehicle.customer_id || !input.account) {
    conflicts.push({
      kind: "missing_current_account",
      title: input.vehicle.customer_id
        ? "Linked account is unavailable"
        : "No current account",
      detail: input.vehicle.customer_id
        ? "The vehicle has an account ID, but that canonical account is missing or not visible."
        : "This vehicle is not currently linked to a customer or business account.",
      sourceIds: [input.vehicle.id, input.vehicle.customer_id].filter(
        (id): id is string => Boolean(id),
      ),
    });
  }

  if (input.account && (!input.account.active || input.account.archived_at || input.account.merged_into_customer_id)) {
    conflicts.push({
      kind: "archived_account",
      title: "Current account needs review",
      detail: input.account.merged_into_customer_id
        ? "The linked account has been merged into another account."
        : "The linked account is inactive or archived.",
      sourceIds: [input.account.id, input.account.merged_into_customer_id].filter(
        (id): id is string => Boolean(id),
      ),
    });
  }

  if (activeWorkOrders.length > 1) {
    conflicts.push({
      kind: "multiple_active_work_orders",
      title: `${activeWorkOrders.length} active work orders`,
      detail: "No work order was selected automatically; each open record is shown separately.",
      sourceIds: activeWorkOrders.map((row) => row.id),
    });
  }

  const historicalAccountIds = new Set(
    [...input.workOrders, ...input.history]
      .map((row) => row.customer_id)
      .filter((id): id is string => Boolean(id) && id !== input.vehicle.customer_id),
  );
  if (historicalAccountIds.size > 0) {
    conflicts.push({
      kind: "historical_owner",
      title: "Historical service uses another account",
      detail:
        "One or more canonical work orders reference a different account. The workspace preserves those historical links and does not infer ownership history.",
      sourceIds: [...historicalAccountIds],
    });
  }

  const vehicleStatus = String(input.vehicle.status ?? "").trim().toLowerCase();
  if (["archived", "merged", "duplicate", "inactive"].includes(vehicleStatus)) {
    conflicts.push({
      kind: "vehicle_status",
      title: `Vehicle status: ${vehicleStatus}`,
      detail: "Review this vehicle record before starting new work.",
      sourceIds: [input.vehicle.id],
    });
  }

  return conflicts;
}

function latestCanonicalServiceWorkOrder(
  workOrders: WorkspaceWorkOrderRow[],
): WorkspaceWorkOrderRow | null {
  return (
    [...workOrders]
      .filter((row) => {
        if (workOrderIsEstimate(row)) return false;
        const state = normalizedOperationalState(row.status);
        return !["archived", "canceled", "cancelled", "void", "voided"].includes(
          state,
        );
      })
      .sort((a, b) => {
        const timeDifference = workOrderEvidenceTime(b) - workOrderEvidenceTime(a);
        return timeDifference === 0 ? b.id.localeCompare(a.id) : timeDifference;
      })[0] ?? null
  );
}

function maintenanceCacheIsFresh(input: {
  cache: MaintenanceSuggestionRow;
  workOrder: WorkspaceWorkOrderRow;
  lines: WorkspaceWorkOrderLineRow[];
}): boolean {
  const cacheTime = Date.parse(input.cache.updated_at);
  if (!Number.isFinite(cacheTime)) return false;

  const sourceTimes = [
    input.workOrder.updated_at,
    input.workOrder.created_at,
    ...input.lines
      .filter((line) => line.work_order_id === input.workOrder.id)
      .flatMap((line) => [line.updated_at, line.created_at]),
  ]
    .map((value) => Date.parse(value ?? ""))
    .filter(Number.isFinite);

  return sourceTimes.every((sourceTime) => cacheTime >= sourceTime);
}

async function loadVehicleBookings(input: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  vehicleId: string;
  now: Date;
}): Promise<WorkspaceBookingRow[]> {
  const upcoming: WorkspaceBookingRow[] = [];
  const appointmentPageSize = 100;
  const nowIso = input.now.toISOString();

  for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
    const from = page * appointmentPageSize;
    const result = await input.supabase
      .from("bookings")
      .select("id,work_order_id,starts_at,ends_at,status,notes,created_at")
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.vehicleId)
      .gte("ends_at", nowIso)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + appointmentPageSize - 1);
    throwQueryError(result.error, "Unable to load upcoming appointments");
    const pageRows = (result.data ?? []) as WorkspaceBookingRow[];
    for (const row of pageRows) {
      if (
        !TERMINAL_APPOINTMENT_STATUSES.has(
          normalizedOperationalState(row.status),
        )
      ) {
        upcoming.push(row);
      }
      if (upcoming.length >= UPCOMING_APPOINTMENT_LIMIT) break;
    }
    if (
      upcoming.length >= UPCOMING_APPOINTMENT_LIMIT ||
      pageRows.length < appointmentPageSize
    ) {
      break;
    }
  }

  const recentResult = await input.supabase
    .from("bookings")
    .select("id,work_order_id,starts_at,ends_at,status,notes,created_at")
    .eq("shop_id", input.shopId)
    .eq("vehicle_id", input.vehicleId)
    .lt("ends_at", nowIso)
    .order("starts_at", { ascending: false })
    .limit(40);
  throwQueryError(recentResult.error, "Unable to load recent appointments");

  const byId = new Map<string, WorkspaceBookingRow>();
  for (const row of [
    ...upcoming.slice(0, UPCOMING_APPOINTMENT_LIMIT),
    ...((recentResult.data ?? []) as WorkspaceBookingRow[]),
  ]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function throwQueryError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function loadVehicleWorkspaceSnapshot(input: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  role: CanonicalRole;
  vehicleId: string;
  now?: Date;
}): Promise<VehicleWorkspaceSnapshot | null> {
  const permissions = vehicleWorkspacePermissionsForRole(input.role);
  const now = input.now ?? new Date();
  const vehicleResult = await input.supabase
    .from("vehicles")
    .select(
      "id,shop_id,customer_id,year,make,model,submodel,vin,license_plate,unit_number,mileage,odometer_unit,engine_hours,status",
    )
    .eq("shop_id", input.shopId)
    .eq("id", input.vehicleId)
    .maybeSingle();
  throwQueryError(vehicleResult.error, "Unable to load vehicle");
  if (!vehicleResult.data) return null;
  const vehicle = vehicleResult.data as WorkspaceVehicleRow;

  const workOrders = await collectAllPages<WorkspaceWorkOrderRow>(
    "Unable to load work orders",
    async (from, to) => {
      const result = await input.supabase
        .from("work_orders")
        .select(
          "id,customer_id,vehicle_id,custom_id,status,record_type,approval_state,estimate_number,estimate_status,scheduled_at,odometer_km,created_at,updated_at",
        )
        .eq("shop_id", input.shopId)
        .eq("vehicle_id", input.vehicleId)
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(from, to);
      return {
        data: (result.data ?? null) as WorkspaceWorkOrderRow[] | null,
        error: result.error,
      };
    },
  );

  // Work-order RLS is the canonical assignment boundary for mechanics. A same-shop
  // vehicle row alone must never grant a mechanic access to unrelated history.
  if (permissions.isAssignedWorkOnly && workOrders.length === 0) return null;

  const workOrderIds = workOrders.map((row) => row.id);
  const maintenanceWorkOrder = latestCanonicalServiceWorkOrder(workOrders);
  const customerId = vehicle.customer_id;
  const emptyRows = Promise.resolve({ data: [], error: null });
  const emptySingle = Promise.resolve({ data: null, error: null });

  const accountQuery = customerId
    ? permissions.canViewAccountContact
      ? input.supabase
          .from("customers")
          .select(
            "id,account_type,active,business_name,name,first_name,last_name,email,phone,phone_number,archived_at,merged_into_customer_id",
          )
          .eq("shop_id", input.shopId)
          .eq("id", customerId)
          .maybeSingle()
      : input.supabase
          .from("customers")
          .select(
            "id,account_type,active,business_name,name,first_name,last_name,archived_at,merged_into_customer_id",
          )
          .eq("shop_id", input.shopId)
          .eq("id", customerId)
          .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    accountResult,
    bookingsResult,
    inspectionsResult,
    linesResult,
    partsResult,
    quoteLinesResult,
    maintenanceResult,
    historyResult,
    relatedVehiclesResult,
    vehicleMediaResult,
    workOrderMediaResult,
    partRequestsResult,
    invoicesResult,
    paymentsResult,
  ] = await Promise.all([
    accountQuery,
    loadVehicleBookings({
      supabase: input.supabase,
      shopId: input.shopId,
      vehicleId: input.vehicleId,
      now,
    }).then((data) => ({ data, error: null })),
    collectAllPages<WorkspaceInspectionRow>(
      "Unable to load inspections",
      async (from, to) => {
        const result = await input.supabase
          .from("inspections")
          .select(
            "id,work_order_id,work_order_line_id,inspection_type,status,completed,summary,created_at,started_at,finalized_at,updated_at,pdf_url,pdf_storage_path",
          )
          .eq("shop_id", input.shopId)
          .eq("vehicle_id", input.vehicleId)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(from, to);
        return {
          data: (result.data ?? null) as WorkspaceInspectionRow[] | null,
          error: result.error,
        };
      },
    ).then((data) => ({ data, error: null })),
    workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspaceWorkOrderLineRow>(
          "Unable to load repair lines",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("work_order_lines")
              .select(
                "id,work_order_id,description,complaint,correction,hold_reason,status,line_status,approval_state,urgency,voided_at,created_at,updated_at",
              )
              .eq("shop_id", input.shopId)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspaceWorkOrderLineRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
    workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspaceWorkOrderPartRow>(
          "Unable to load installed parts",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("work_order_parts")
              .select(
                "id,work_order_id,work_order_line_id,description_snapshot,manufacturer_snapshot,part_number_snapshot,sku_snapshot,quantity_consumed,quantity_returned,is_active,created_at,updated_at",
              )
              .eq("shop_id", input.shopId)
              .eq("is_active", true)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspaceWorkOrderPartRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
    workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspaceQuoteLineRow>(
          "Unable to load estimate items",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("work_order_quote_lines")
              .select(
                "id,work_order_id,work_order_line_id,source_work_order_line_id,description,title,status,decision,defer_reason,decline_reason,approved_at,deferred_at,declined_at,created_at,updated_at",
              )
              .eq("shop_id", input.shopId)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspaceQuoteLineRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
    maintenanceWorkOrder
      ? input.supabase
          .from("maintenance_suggestions")
          .select("work_order_id,vehicle_id,status,suggestions,created_at,updated_at,error_message,mileage_km")
          .eq("vehicle_id", input.vehicleId)
          .eq("work_order_id", maintenanceWorkOrder.id)
          .eq("status", "ready")
          .maybeSingle()
      : emptySingle,
    input.supabase
      .from("history")
      .select(
        "id,customer_id,work_order_id,work_order_number,historical_status,description,odometer,service_date,opened_at,closed_at,source_system",
      )
      .eq("vehicle_id", input.vehicleId)
      .order("service_date", { ascending: false })
      .limit(50),
    customerId && permissions.canViewRelatedVehicles
      ? input.supabase
          .from("vehicles")
          .select("id,year,make,model,unit_number,status")
          .eq("shop_id", input.shopId)
          .eq("customer_id", customerId)
          .neq("id", input.vehicleId)
          .limit(20)
      : emptyRows,
    collectAllPages<WorkspaceVehicleMediaRow>(
      "Unable to load vehicle media",
      async (from, to) => {
        const result = await input.supabase
          .from("vehicle_media")
          .select("id,type,filename,created_at")
          .eq("shop_id", input.shopId)
          .eq("vehicle_id", input.vehicleId)
          .order("id", { ascending: true })
          .range(from, to);
        return {
          data: (result.data ?? null) as WorkspaceVehicleMediaRow[] | null,
          error: result.error,
        };
      },
    ).then((data) => ({ data, error: null })),
    workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspaceWorkOrderMediaRow>(
          "Unable to load work-order media",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("work_order_media")
              .select("id,work_order_id,kind,file_name,created_at")
              .eq("shop_id", input.shopId)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspaceWorkOrderMediaRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
    permissions.canViewPartRequests && workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspacePartRequestRow>(
          "Unable to load parts requests",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("part_requests")
              .select("id,work_order_id,status,notes,created_at")
              .eq("shop_id", input.shopId)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspacePartRequestRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
    permissions.canViewFinancials && workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspaceInvoiceRow>(
          "Unable to load invoices",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("invoices")
              .select(
                "id,work_order_id,invoice_number,status,currency,total,outstanding_total,paid_total,created_at,issued_at,paid_at,updated_at",
              )
              .eq("shop_id", input.shopId)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspaceInvoiceRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
    permissions.canViewFinancials && workOrderIds.length
      ? collectWorkOrderScopedRows<WorkspacePaymentRow>(
          "Unable to load payments",
          workOrderIds,
          async (ids, from, to) => {
            const result = await input.supabase
              .from("payments")
              .select("id,work_order_id,status,amount,currency,paid_at,created_at")
              .eq("shop_id", input.shopId)
              .in("work_order_id", ids)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (result.data ?? null) as WorkspacePaymentRow[] | null,
              error: result.error,
            };
          },
        ).then((data) => ({ data, error: null }))
      : emptyRows,
  ]);

  for (const [result, context] of [
    [accountResult, "account"],
    [bookingsResult, "appointments"],
    [inspectionsResult, "inspections"],
    [linesResult, "repair lines"],
    [partsResult, "installed parts"],
    [quoteLinesResult, "estimate items"],
    [maintenanceResult, "maintenance evidence"],
    [historyResult, "history"],
    [relatedVehiclesResult, "related vehicles"],
    [vehicleMediaResult, "vehicle media"],
    [workOrderMediaResult, "work-order media"],
    [partRequestsResult, "parts requests"],
    [invoicesResult, "invoices"],
    [paymentsResult, "payments"],
  ] as const) {
    throwQueryError(result.error, `Unable to load ${context}`);
  }

  const accountRow = (accountResult.data ?? null) as WorkspaceCustomerRow | null;
  const bookings = (bookingsResult.data ?? []) as WorkspaceBookingRow[];
  const inspections = (inspectionsResult.data ?? []) as WorkspaceInspectionRow[];
  const lines = (linesResult.data ?? []) as WorkspaceWorkOrderLineRow[];
  const parts = (partsResult.data ?? []) as WorkspaceWorkOrderPartRow[];
  const quoteLines = (quoteLinesResult.data ?? []) as WorkspaceQuoteLineRow[];
  const maintenanceCandidate = (maintenanceResult.data ?? null) as
    | MaintenanceSuggestionRow
    | null;
  const maintenance =
    maintenanceCandidate &&
    maintenanceWorkOrder &&
    maintenanceCacheIsFresh({
      cache: maintenanceCandidate,
      workOrder: maintenanceWorkOrder,
      lines,
    })
      ? [maintenanceCandidate]
      : [];
  const history = (historyResult.data ?? []) as WorkspaceHistoryRow[];
  const vehicleMedia = (vehicleMediaResult.data ?? []) as WorkspaceVehicleMediaRow[];
  const workOrderMedia = (workOrderMediaResult.data ?? []) as WorkspaceWorkOrderMediaRow[];
  const partRequests = (partRequestsResult.data ?? []) as WorkspacePartRequestRow[];
  const invoices = (invoicesResult.data ?? []) as WorkspaceInvoiceRow[];
  const payments = (paymentsResult.data ?? []) as WorkspacePaymentRow[];
  const workOrdersById = new Map(workOrders.map((row) => [row.id, row]));

  const currentAccount: CustomerAccountSummary | null = accountRow
    ? {
        id: accountRow.id,
        displayName: customerAccountDisplayName(accountRow),
        accountType: accountRow.account_type,
        active: accountRow.active,
        ...(permissions.canViewAccountContact
          ? {
              email: accountRow.email ?? null,
              phone: accountRow.phone ?? accountRow.phone_number ?? null,
            }
          : {}),
        archivedAt: accountRow.archived_at,
        mergedIntoCustomerId: accountRow.merged_into_customer_id,
      }
    : null;

  const upcomingAppointments: AppointmentSummary[] = bookings
    .filter(
      (row) =>
        new Date(row.ends_at).getTime() >= now.getTime() &&
        !TERMINAL_APPOINTMENT_STATUSES.has(
          normalizedOperationalState(row.status),
        ),
    )
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((row) => ({
      title: "Appointment",
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      detail: text(row.notes),
      reference: {
        sourceType: "appointment",
        sourceId: row.id,
        sourceLabel: `Appointment ${row.id.slice(0, 8)}`,
        href: `/dashboard/appointments?bookingId=${encodeURIComponent(row.id)}`,
      },
    }));

  const activeWork: ActiveWorkSummary[] = [];
  for (const row of workOrders) {
    const isEstimate = workOrderIsEstimate(row);
    if (workOrderIsTerminal(row) || (isEstimate && !estimateIsActionable(row))) {
      continue;
    }
    activeWork.push({
      kind: isEstimate ? "estimate" : "work_order",
      title: isEstimate
        ? row.estimate_number
          ? `Estimate ${row.estimate_number}`
          : `Estimate ${row.id.slice(0, 8)}`
        : workOrderLabel(row),
      status: isEstimate ? row.estimate_status ?? row.status : row.status,
      detail: row.approval_state,
      occurredAt: row.updated_at ?? row.created_at,
      reference: workOrderReference(row),
    });
  }
  for (const row of inspections) {
    const status = normalizedOperationalState(row.status);
    if (row.completed || !OPEN_INSPECTION_STATUSES.has(status)) continue;
    activeWork.push({
      kind: "inspection",
      title: inspectionReference(row).sourceLabel,
      status: row.status,
      detail: null,
      occurredAt: row.updated_at ?? row.created_at,
      reference: inspectionReference(row),
    });
  }
  for (const row of invoices) {
    if (Number(row.outstanding_total) <= 0) continue;
    activeWork.push({
      kind: "invoice",
      title: row.invoice_number ? `Invoice ${row.invoice_number}` : `Invoice ${row.id.slice(0, 8)}`,
      status: row.status,
      detail: "Vehicle-related balance",
      occurredAt: row.updated_at,
      amount: Number(row.outstanding_total),
      currency: row.currency,
      reference: {
        sourceType: "invoice",
        sourceId: row.id,
        sourceLabel: row.invoice_number ? `Invoice ${row.invoice_number}` : `Invoice ${row.id.slice(0, 8)}`,
        href: row.work_order_id ? `/work-orders/invoice/${row.work_order_id}` : "/billing",
      },
    });
  }
  for (const row of partRequests) {
    if (TERMINAL_PART_REQUEST_STATUSES.has(normalizedOperationalState(row.status))) {
      continue;
    }
    const workOrder = row.work_order_id
      ? workOrdersById.get(row.work_order_id)
      : null;
    const requestSummary = text(row.notes)?.split(/\r?\n/, 1)[0]?.trim() || null;
    activeWork.push({
      kind: "part_request",
      title:
        requestSummary ??
        (workOrder ? `Parts for ${workOrderLabel(workOrder)}` : "Parts request"),
      status: row.status,
      detail: workOrder ? `Requested for ${workOrderLabel(workOrder)}` : null,
      occurredAt: row.created_at,
      reference: {
        sourceType: "part_request",
        sourceId: row.id,
        sourceLabel: `Parts request ${row.id.slice(0, 8)}`,
        href: `/parts/requests/${row.id}`,
      },
    });
  }

  const relatedVehicles = (relatedVehiclesResult.data ?? []).map((row) => {
    const identity = workspaceVehicleIdentity({
      ...vehicle,
      id: row.id,
      year: row.year,
      make: row.make,
      model: row.model,
      unit_number: row.unit_number,
      status: row.status,
    });
    return {
      id: row.id,
      label: vehicleIdentityLabel(identity),
      status: row.status,
      href: `/vehicles/${row.id}`,
    } satisfies RelatedVehicleSummary;
  });

  return {
    identity: workspaceVehicleIdentity(vehicle, workOrders),
    currentAccount,
    permissions,
    activeWork: activeWork.sort(
      (a, b) => new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime(),
    ),
    upcomingAppointments,
    attentionItems: buildAttentionItems({
      workOrdersById,
      lines,
      quoteLines,
      inspections,
      maintenance,
    }),
    recentTimeline: buildTimeline({
      workOrders,
      bookings,
      inspections,
      lines,
      parts,
      quoteLines,
      history,
      invoices,
      payments,
    }),
    financialSummary: permissions.canViewFinancials
      ? buildFinancialSummary(invoices)
      : { visible: false },
    documentSummary: buildDocumentSummary({
      vehicleMedia,
      workOrderMedia,
      inspections,
      workOrdersById,
    }),
    relatedVehicles,
    conflicts: buildConflicts({
      vehicle,
      account: accountRow,
      workOrders,
      history,
    }),
  };
}

export function vehicleWorkspaceCreateWorkOrderHref(
  snapshot: VehicleWorkspaceSnapshot,
): string | null {
  if (!snapshot.permissions.canCreateWorkOrder) return null;
  if (
    snapshot.conflicts.some((conflict) =>
      ["archived_account", "vehicle_status"].includes(conflict.kind),
    )
  ) {
    return null;
  }
  return createWorkOrderHandoffHref({
    customerId: snapshot.currentAccount?.id ?? null,
    vehicleId: snapshot.identity.id,
  });
}
