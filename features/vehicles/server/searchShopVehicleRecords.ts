import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  isEstimateRecord,
  normalizeWorkOrderStatus,
} from "@/features/work-orders/lib/work-order-status";
import {
  createWorkOrderHandoffHref,
  customerAccountDisplayName,
  type AppointmentSummary,
  type CustomerAccountSummary,
  type VehicleIdentity,
  type VehicleWorkspaceSearchResponse,
} from "@/features/vehicles/lib/vehicleWorkspace";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";

type ShopSupabase = SupabaseClient<Database>;
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type WorkOrderLineRow =
  Database["public"]["Tables"]["work_order_lines"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];

type SearchCustomerRow = Pick<
  CustomerRow,
  | "id"
  | "account_type"
  | "active"
  | "business_name"
  | "name"
  | "first_name"
  | "last_name"
  | "identity_name"
  | "archived_at"
  | "merged_into_customer_id"
> &
  Partial<
    Pick<
      CustomerRow,
      | "email"
      | "phone"
      | "phone_number"
      | "identity_email"
      | "identity_phone"
    >
  >;

type SearchVehicleRow = Pick<
  VehicleRow,
  | "id"
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
  | "created_at"
>;

type SearchWorkOrderRow = Pick<
  WorkOrderRow,
  | "id"
  | "custom_id"
  | "status"
  | "record_type"
  | "estimate_number"
  | "estimate_status"
  | "customer_id"
  | "customer_name"
  | "vehicle_id"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_submodel"
  | "vehicle_vin"
  | "vehicle_license_plate"
  | "vehicle_unit_number"
  | "vehicle_mileage"
  | "odometer_km"
  | "scheduled_at"
  | "created_at"
  | "updated_at"
>;

type SearchBookingRow = Pick<
  BookingRow,
  | "id"
  | "vehicle_id"
  | "work_order_id"
  | "status"
  | "starts_at"
  | "ends_at"
  | "notes"
>;

type SearchLineRow = Pick<
  WorkOrderLineRow,
  | "id"
  | "vehicle_id"
  | "work_order_id"
  | "status"
  | "line_status"
  | "approval_state"
  | "hold_reason"
  | "voided_at"
>;

type SearchQuoteLineRow = Pick<
  Database["public"]["Tables"]["work_order_quote_lines"]["Row"],
  | "id"
  | "vehicle_id"
  | "work_order_id"
  | "work_order_line_id"
  | "source_work_order_line_id"
  | "status"
  | "decision"
>;

type SearchInvoiceRow = Pick<
  InvoiceRow,
  "id" | "work_order_id" | "outstanding_total" | "currency"
>;

const DEFAULT_RESULT_LIMIT = 20;
const MAX_RESULT_LIMIT = 30;
const SEARCH_SCAN_LIMIT = 120;
const MECHANIC_SCOPE_LIMIT = 1_000;
const SUMMARY_ROW_LIMIT = 1_000;
const TERMINAL_WORK_ORDER_STATUSES = new Set([
  "archived",
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "invoiced",
  "paid",
  "void",
  "voided",
]);
const ACTIVE_ESTIMATE_STATUSES = new Set([
  "draft",
  "waiting_for_parts",
  "ready_for_advisor",
  "sent",
  "partially_approved",
]);
const ATTENTION_STATES = new Set([
  "declined",
  "deferred",
  "on_hold",
  "waiting_parts",
  "awaiting_parts",
  "parts_needed",
]);
const TERMINAL_LINE_STATES = new Set([
  "canceled",
  "cancelled",
  "completed",
  "invoiced",
  "ready_to_invoice",
  "voided",
]);
const TERMINAL_APPOINTMENT_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
]);
const BLOCKED_CREATE_WORK_ORDER_VEHICLE_STATUSES = new Set([
  "archived",
  "merged",
  "duplicate",
  "inactive",
]);

const VEHICLE_COLUMNS =
  "id,customer_id,year,make,model,submodel,vin,license_plate,unit_number,mileage,odometer_unit,engine_hours,status,created_at";
const CUSTOMER_COLUMNS =
  "id,account_type,active,business_name,name,first_name,last_name,email,phone,phone_number,identity_name,identity_email,identity_phone,archived_at,merged_into_customer_id";
const CUSTOMER_SAFE_COLUMNS =
  "id,account_type,active,business_name,name,first_name,last_name,identity_name,archived_at,merged_into_customer_id";
const WORK_ORDER_COLUMNS =
  "id,custom_id,status,record_type,estimate_number,estimate_status,customer_id,customer_name,vehicle_id,vehicle_year,vehicle_make,vehicle_model,vehicle_submodel,vehicle_vin,vehicle_license_plate,vehicle_unit_number,vehicle_mileage,odometer_km,scheduled_at,created_at,updated_at";

function normalizedState(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function sanitizeVehicleWorkspaceSearchQuery(value: unknown): string {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9@.+ _'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function searchTerms(query: string): string[] {
  return Array.from(
    new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []),
  ).slice(0, 10);
}

function workOrderSearchTerms(terms: string[]): string[] {
  if (terms[0] === "wo") return terms.slice(1);
  if (terms.length === 1) {
    const compactMatch = /^wo(\d+)$/.exec(terms[0]);
    if (compactMatch) return [compactMatch[1]];
  }
  return terms;
}

function searchableText(values: unknown[]): string {
  return values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function matchesEveryTerm(values: unknown[], terms: string[]): boolean {
  const text = searchableText(values);
  const compact = text.replace(/[^a-z0-9]/g, "");
  return terms.every(
    (term) => text.includes(term) || compact.includes(term.replace(/[^a-z0-9]/g, "")),
  );
}

function ilikeCandidateFilters(field: string, term: string): string[] {
  const filters = [`${field}.ilike.%${term}%`];
  // Candidate queries need to tolerate separators in stored VINs, plates, and
  // phone numbers (for example, ABC-123 vs ABC123). The term is already reduced
  // to [a-z0-9] by searchTerms(), and the exact compact comparison above remains
  // the final match check, so this broader pattern cannot create a result match.
  if (term.length >= 4) {
    filters.push(`${field}.ilike.%${term.split("").join("%")}%`);
  }
  return filters;
}

function vehicleFilterForTerm(term: string): string {
  const filters = [
    ...ilikeCandidateFilters("vin", term),
    ...ilikeCandidateFilters("license_plate", term),
    `unit_number.ilike.%${term}%`,
    `make.ilike.%${term}%`,
    `model.ilike.%${term}%`,
    `submodel.ilike.%${term}%`,
  ];
  if (/^\d{4}$/.test(term)) filters.push(`year.eq.${term}`);
  return filters.join(",");
}

function customerFilterForTerm(term: string, includeContact: boolean): string {
  const fields = ["business_name", "name", "first_name", "last_name", "identity_name"];
  const filters = fields.map((field) => `${field}.ilike.%${term}%`);
  if (includeContact) {
    filters.push(
      `email.ilike.%${term}%`,
      `identity_email.ilike.%${term}%`,
      ...ilikeCandidateFilters("phone", term),
      ...ilikeCandidateFilters("phone_number", term),
      ...ilikeCandidateFilters("identity_phone", term),
    );
  }
  return filters.join(",");
}

function workOrderFilterForTerm(term: string): string {
  const filters = [
    ...ilikeCandidateFilters("custom_id", term),
    `customer_name.ilike.%${term}%`,
    ...ilikeCandidateFilters("vehicle_vin", term),
    ...ilikeCandidateFilters("vehicle_license_plate", term),
    `vehicle_unit_number.ilike.%${term}%`,
    `vehicle_make.ilike.%${term}%`,
    `vehicle_model.ilike.%${term}%`,
    `vehicle_submodel.ilike.%${term}%`,
  ];
  if (/^\d{4}$/.test(term)) filters.push(`vehicle_year.eq.${term}`);
  return filters.join(",");
}

function vehicleMatches(row: SearchVehicleRow, terms: string[]): boolean {
  return matchesEveryTerm(
    [
      row.year,
      row.make,
      row.model,
      row.submodel,
      row.vin,
      row.license_plate,
      row.unit_number,
    ],
    terms,
  );
}

function customerMatches(row: SearchCustomerRow, terms: string[]): boolean {
  return matchesEveryTerm(
    [
      row.business_name,
      row.name,
      row.first_name,
      row.last_name,
      row.email,
      row.phone,
      row.phone_number,
      row.identity_name,
      row.identity_email,
      row.identity_phone,
    ],
    terms,
  );
}

function workOrderMatches(row: SearchWorkOrderRow, terms: string[]): boolean {
  return matchesEveryTerm(
    [
      row.custom_id,
      row.customer_name,
      row.vehicle_year,
      row.vehicle_make,
      row.vehicle_model,
      row.vehicle_submodel,
      row.vehicle_vin,
      row.vehicle_license_plate,
      row.vehicle_unit_number,
    ],
    terms,
  );
}

function toVehicleIdentity(row: SearchVehicleRow): VehicleIdentity {
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    submodel: row.submodel,
    vin: row.vin,
    licensePlate: row.license_plate,
    unitNumber: row.unit_number,
    mileage: row.mileage,
    odometerUnit: row.odometer_unit,
    engineHours: row.engine_hours,
    status: row.status,
  };
}

function toAccountSummary(
  row: SearchCustomerRow,
): Pick<CustomerAccountSummary, "id" | "displayName" | "accountType" | "active"> {
  return {
    id: row.id,
    displayName: customerAccountDisplayName(row),
    accountType: row.account_type,
    active: row.active,
  };
}

function workOrderTitle(row: SearchWorkOrderRow): string {
  const isEstimate = workOrderIsEstimate(row);
  if (isEstimate) {
    return row.estimate_number
      ? `Estimate ${row.estimate_number}`
      : `Estimate ${row.id.slice(0, 8)}`;
  }
  return row.custom_id
    ? `WO-${row.custom_id.replace(/^wo-?/i, "")}`
    : `WO ${row.id.slice(0, 8)}`;
}

function workOrderHref(row: SearchWorkOrderRow): string {
  return workOrderIsEstimate(row)
    ? `/estimates/${row.id}`
    : `/work-orders/${row.id}`;
}

function workOrderDisplayStatus(row: SearchWorkOrderRow): string {
  const isEstimate = workOrderIsEstimate(row);
  return isEstimate ? row.estimate_status ?? row.status : row.status;
}

function workOrderIsEstimate(row: SearchWorkOrderRow): boolean {
  return isEstimateRecord(row);
}

function workOrderEvidenceTime(row: SearchWorkOrderRow): number {
  const value = Date.parse(row.scheduled_at ?? row.created_at ?? "");
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function latestOdometerWorkOrder(
  rows: SearchWorkOrderRow[],
): SearchWorkOrderRow | null {
  return rows.reduce<SearchWorkOrderRow | null>((latest, row) => {
    if (row.odometer_km === null || !Number.isFinite(Number(row.odometer_km))) {
      return latest;
    }
    if (!latest || workOrderEvidenceTime(row) > workOrderEvidenceTime(latest)) {
      return row;
    }
    return latest;
  }, null);
}

function workOrderIsActive(row: SearchWorkOrderRow): boolean {
  if (
    TERMINAL_WORK_ORDER_STATUSES.has(normalizedState(row.status)) ||
    TERMINAL_WORK_ORDER_STATUSES.has(normalizeWorkOrderStatus(row.status))
  ) {
    return false;
  }
  const isEstimate = workOrderIsEstimate(row);
  return (
    !isEstimate ||
    ACTIVE_ESTIMATE_STATUSES.has(normalizedState(row.estimate_status))
  );
}

function appointmentSummary(row: SearchBookingRow): AppointmentSummary {
  return {
    title: "Appointment",
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    detail: row.notes?.trim() || null,
    reference: {
      sourceType: "appointment",
      sourceId: row.id,
      sourceLabel: `Appointment ${row.id.slice(0, 8)}`,
      href: `/dashboard/appointments?bookingId=${encodeURIComponent(row.id)}`,
    },
  };
}

function lineNeedsAttention(row: SearchLineRow): boolean {
  if (row.voided_at) return false;
  const states = [row.status, row.line_status, row.approval_state].map(
    normalizedState,
  );
  if (states.some((state) => TERMINAL_LINE_STATES.has(state))) return false;
  return (
    states.some((state) => ATTENTION_STATES.has(state)) ||
    Boolean(row.hold_reason?.trim())
  );
}

function quoteLineNeedsAttention(row: SearchQuoteLineRow): boolean {
  const state = normalizedState(row.decision ?? row.status);
  return [
    "deferred",
    "declined",
    "customer_deferred",
    "customer_declined",
  ].includes(state);
}

function assertQuerySucceeded(
  label: string,
  error: { message: string } | null,
): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function searchShopVehicleRecords(input: {
  supabase: ShopSupabase;
  shopId: string;
  role: CanonicalRole;
  query: unknown;
  limit?: number;
  now?: Date;
}): Promise<VehicleWorkspaceSearchResponse> {
  const query = sanitizeVehicleWorkspaceSearchQuery(input.query);
  const terms = searchTerms(query);
  const permissions = vehicleWorkspacePermissionsForRole(input.role);
  const canSearchAccountContact = permissions.canViewAccountContact;
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? DEFAULT_RESULT_LIMIT), 1),
    MAX_RESULT_LIMIT,
  );

  const isMechanic = permissions.isAssignedWorkOnly;
  let visibleMechanicWorkOrders: SearchWorkOrderRow[] = [];
  let allowedMechanicVehicleRows: SearchVehicleRow[] = [];

  if (isMechanic) {
    const { data, error } = await input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(MECHANIC_SCOPE_LIMIT);
    assertQuerySucceeded("Unable to resolve assigned work orders", error);
    visibleMechanicWorkOrders = (data ?? []) as SearchWorkOrderRow[];

    const allowedVehicleIds = Array.from(
      new Set(
        visibleMechanicWorkOrders
          .map((row) => row.vehicle_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (allowedVehicleIds.length) {
      const { data: vehicleData, error: vehicleError } = await input.supabase
        .from("vehicles")
        .select(VEHICLE_COLUMNS)
        .eq("shop_id", input.shopId)
        .in("id", allowedVehicleIds)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(MECHANIC_SCOPE_LIMIT);
      assertQuerySucceeded("Unable to resolve assigned vehicles", vehicleError);
      allowedMechanicVehicleRows = (vehicleData ?? []) as SearchVehicleRow[];
    }
  }

  let directVehicleMatches: SearchVehicleRow[];
  if (isMechanic) {
    directVehicleMatches = allowedMechanicVehicleRows.filter((row) =>
      vehicleMatches(row, terms),
    );
  } else {
    let vehicleQuery = input.supabase
      .from("vehicles")
      .select(VEHICLE_COLUMNS)
      .eq("shop_id", input.shopId);
    for (const term of terms) {
      vehicleQuery = vehicleQuery.or(vehicleFilterForTerm(term));
    }
    const { data, error } = await vehicleQuery
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(SEARCH_SCAN_LIMIT);
    assertQuerySucceeded("Unable to search vehicles", error);
    directVehicleMatches = ((data ?? []) as SearchVehicleRow[]).filter((row) =>
      vehicleMatches(row, terms),
    );
  }

  const normalizedWorkOrderTerms = workOrderSearchTerms(terms);
  let matchedWorkOrders: SearchWorkOrderRow[];
  if (!terms.length) {
    matchedWorkOrders = [];
  } else if (isMechanic) {
    matchedWorkOrders = visibleMechanicWorkOrders.filter((row) =>
      workOrderMatches(row, normalizedWorkOrderTerms),
    );
  } else {
    let workOrderQuery = input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId);
    for (const term of normalizedWorkOrderTerms) {
      workOrderQuery = workOrderQuery.or(workOrderFilterForTerm(term));
    }
    const { data, error } = await workOrderQuery
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(SEARCH_SCAN_LIMIT);
    assertQuerySucceeded("Unable to search work orders", error);
    matchedWorkOrders = ((data ?? []) as SearchWorkOrderRow[]).filter((row) =>
      workOrderMatches(row, normalizedWorkOrderTerms),
    );
  }

  let matchedCustomers: SearchCustomerRow[] = [];
  const mechanicCustomerIds = Array.from(
    new Set(
      allowedMechanicVehicleRows
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (terms.length && (!isMechanic || mechanicCustomerIds.length)) {
    let customerRows: SearchCustomerRow[];
    if (canSearchAccountContact) {
      let customerQuery = input.supabase
        .from("customers")
        .select(CUSTOMER_COLUMNS)
        .eq("shop_id", input.shopId);
      if (isMechanic) {
        customerQuery = customerQuery.in("id", mechanicCustomerIds);
      }
      for (const term of terms) {
        customerQuery = customerQuery.or(customerFilterForTerm(term, true));
      }
      const { data, error } = await customerQuery.limit(SEARCH_SCAN_LIMIT);
      assertQuerySucceeded("Unable to search customer accounts", error);
      customerRows = (data ?? []) as SearchCustomerRow[];
    } else {
      let customerQuery = input.supabase
        .from("customers")
        .select(CUSTOMER_SAFE_COLUMNS)
        .eq("shop_id", input.shopId);
      if (isMechanic) {
        customerQuery = customerQuery.in("id", mechanicCustomerIds);
      }
      for (const term of terms) {
        customerQuery = customerQuery.or(customerFilterForTerm(term, false));
      }
      const { data, error } = await customerQuery.limit(SEARCH_SCAN_LIMIT);
      assertQuerySucceeded("Unable to search customer accounts", error);
      customerRows = (data ?? []) as SearchCustomerRow[];
    }
    matchedCustomers = customerRows.filter((row) =>
      customerMatches(row, terms),
    );
  }

  const matchedCustomerIds = new Set(matchedCustomers.map((row) => row.id));
  let expandedCustomerVehicles: SearchVehicleRow[] = [];
  if (matchedCustomerIds.size) {
    if (isMechanic) {
      expandedCustomerVehicles = allowedMechanicVehicleRows.filter(
        (row) => row.customer_id && matchedCustomerIds.has(row.customer_id),
      );
    } else {
      const { data, error } = await input.supabase
        .from("vehicles")
        .select(VEHICLE_COLUMNS)
        .eq("shop_id", input.shopId)
        .in("customer_id", Array.from(matchedCustomerIds))
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(SUMMARY_ROW_LIMIT);
      assertQuerySucceeded("Unable to expand customer vehicles", error);
      expandedCustomerVehicles = (data ?? []) as SearchVehicleRow[];
    }
  }

  const candidateVehicleIds = new Map<string, true>();
  for (const row of directVehicleMatches) candidateVehicleIds.set(row.id, true);
  for (const row of matchedWorkOrders) {
    if (row.vehicle_id) candidateVehicleIds.set(row.vehicle_id, true);
  }
  for (const row of expandedCustomerVehicles) candidateVehicleIds.set(row.id, true);

  const boundedVehicleIds = Array.from(candidateVehicleIds.keys()).slice(0, limit);
  let vehicles: SearchVehicleRow[] = [];
  if (boundedVehicleIds.length) {
    const { data, error } = await input.supabase
      .from("vehicles")
      .select(VEHICLE_COLUMNS)
      .eq("shop_id", input.shopId)
      .in("id", boundedVehicleIds);
    assertQuerySucceeded("Unable to load canonical vehicles", error);
    const byId = new Map(
      ((data ?? []) as SearchVehicleRow[]).map((row) => [row.id, row]),
    );
    vehicles = boundedVehicleIds
      .map((id) => byId.get(id))
      .filter((row): row is SearchVehicleRow => Boolean(row));
  }

  const currentCustomerIds = Array.from(
    new Set(
      vehicles
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const accountsById = new Map<string, SearchCustomerRow>();
  if (currentCustomerIds.length) {
    const { data, error } = await input.supabase
      .from("customers")
      .select(CUSTOMER_SAFE_COLUMNS)
      .eq("shop_id", input.shopId)
      .in("id", currentCustomerIds);
    assertQuerySucceeded("Unable to load current accounts", error);
    for (const row of (data ?? []) as SearchCustomerRow[]) accountsById.set(row.id, row);
  }

  let workOrders: SearchWorkOrderRow[] = [];
  if (boundedVehicleIds.length) {
    const { data, error } = await input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .in("vehicle_id", boundedVehicleIds)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(SUMMARY_ROW_LIMIT);
    assertQuerySucceeded("Unable to load vehicle work orders", error);
    workOrders = (data ?? []) as SearchWorkOrderRow[];
  }

  let bookings: SearchBookingRow[] = [];
  if (boundedVehicleIds.length) {
    const { data, error } = await input.supabase
      .from("bookings")
      .select("id,vehicle_id,work_order_id,status,starts_at,ends_at,notes")
      .eq("shop_id", input.shopId)
      .in("vehicle_id", boundedVehicleIds)
      .gte("ends_at", (input.now ?? new Date()).toISOString())
      .order("starts_at", { ascending: true })
      .limit(SUMMARY_ROW_LIMIT);
    assertQuerySucceeded("Unable to load vehicle appointments", error);
    bookings = ((data ?? []) as SearchBookingRow[]).filter(
      (row) => !TERMINAL_APPOINTMENT_STATUSES.has(normalizedState(row.status)),
    );
  }

  const workOrderVehicleById = new Map(
    workOrders
      .filter(
        (row): row is SearchWorkOrderRow & { vehicle_id: string } =>
          Boolean(row.vehicle_id),
      )
      .map((row) => [row.id, row.vehicle_id]),
  );
  const workOrderIds = Array.from(workOrderVehicleById.keys());

  let attentionLines: SearchLineRow[] = [];
  let attentionQuoteLines: SearchQuoteLineRow[] = [];
  if (boundedVehicleIds.length) {
    const references = [`vehicle_id.in.(${boundedVehicleIds.join(",")})`];
    if (workOrderIds.length) {
      references.push(`work_order_id.in.(${workOrderIds.join(",")})`);
    }
    const { data, error } = await input.supabase
      .from("work_order_lines")
      .select(
        "id,vehicle_id,work_order_id,status,line_status,approval_state,hold_reason,voided_at",
      )
      .eq("shop_id", input.shopId)
      .or(references.join(","))
      .limit(SUMMARY_ROW_LIMIT);
    assertQuerySucceeded("Unable to load vehicle attention items", error);
    attentionLines = ((data ?? []) as SearchLineRow[]).filter(lineNeedsAttention);

    const { data: quoteLineData, error: quoteLineError } = await input.supabase
      .from("work_order_quote_lines")
      .select(
        "id,vehicle_id,work_order_id,work_order_line_id,source_work_order_line_id,status,decision",
      )
      .eq("shop_id", input.shopId)
      .or(references.join(","))
      .limit(SUMMARY_ROW_LIMIT);
    assertQuerySucceeded(
      "Unable to load deferred vehicle estimate items",
      quoteLineError,
    );
    attentionQuoteLines = ((quoteLineData ?? []) as SearchQuoteLineRow[]).filter(
      quoteLineNeedsAttention,
    );
  }

  let invoices: SearchInvoiceRow[] = [];
  if (permissions.canViewFinancials && workOrderIds.length) {
    const { data, error } = await input.supabase
      .from("invoices")
      .select("id,work_order_id,outstanding_total,currency")
      .eq("shop_id", input.shopId)
      .in("work_order_id", workOrderIds)
      .gt("outstanding_total", 0)
      .limit(SUMMARY_ROW_LIMIT);
    assertQuerySucceeded("Unable to load vehicle balances", error);
    invoices = (data ?? []) as SearchInvoiceRow[];
  }

  const activeWorkOrdersByVehicle = new Map<string, SearchWorkOrderRow[]>();
  for (const row of workOrders) {
    if (!row.vehicle_id || !workOrderIsActive(row)) continue;
    const rows = activeWorkOrdersByVehicle.get(row.vehicle_id) ?? [];
    rows.push(row);
    activeWorkOrdersByVehicle.set(row.vehicle_id, rows);
  }

  const appointmentByVehicle = new Map<string, SearchBookingRow>();
  for (const row of bookings) {
    if (row.vehicle_id && !appointmentByVehicle.has(row.vehicle_id)) {
      appointmentByVehicle.set(row.vehicle_id, row);
    }
  }

  const attentionCountByVehicle = new Map<string, number>();
  const representedLineIds = new Set(
    attentionQuoteLines.flatMap((row) =>
      [row.work_order_line_id, row.source_work_order_line_id].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  for (const row of attentionQuoteLines) {
    const vehicleId = row.vehicle_id ?? workOrderVehicleById.get(row.work_order_id);
    if (!vehicleId) continue;
    attentionCountByVehicle.set(
      vehicleId,
      (attentionCountByVehicle.get(vehicleId) ?? 0) + 1,
    );
  }
  for (const row of attentionLines) {
    if (representedLineIds.has(row.id)) continue;
    const vehicleId = row.vehicle_id ?? workOrderVehicleById.get(row.work_order_id);
    if (!vehicleId) continue;
    attentionCountByVehicle.set(
      vehicleId,
      (attentionCountByVehicle.get(vehicleId) ?? 0) + 1,
    );
  }

  const invoicesByVehicle = new Map<string, SearchInvoiceRow[]>();
  for (const row of invoices) {
    if (!row.work_order_id) continue;
    const vehicleId = workOrderVehicleById.get(row.work_order_id);
    if (!vehicleId) continue;
    const rows = invoicesByVehicle.get(vehicleId) ?? [];
    rows.push(row);
    invoicesByVehicle.set(vehicleId, rows);
  }

  const groupMap = new Map<
    string,
    VehicleWorkspaceSearchResponse["groups"][number]
  >();
  for (const vehicle of vehicles) {
    const accountRow = vehicle.customer_id
      ? accountsById.get(vehicle.customer_id) ?? null
      : null;
    const groupKey = accountRow?.id ?? "__orphan__";
    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        account: accountRow ? toAccountSummary(accountRow) : null,
        matchedAccount: Boolean(accountRow && matchedCustomerIds.has(accountRow.id)),
        vehicles: [],
      };
      groupMap.set(groupKey, group);
    }

    const vehicleWorkOrders = workOrders.filter(
      (row) => row.vehicle_id === vehicle.id,
    );
    const latestWorkOrderOdometer = latestOdometerWorkOrder(vehicleWorkOrders);
    const workOrderOdometer = latestWorkOrderOdometer
      ? String(latestWorkOrderOdometer.odometer_km)
      : null;
    // vehicles.mileage has no update timestamp in the canonical schema. Prefer
    // the newest timestamped WO evidence and use the vehicle value only when no
    // WO has an odometer reading.
    const odometer = workOrderOdometer ?? vehicle.mileage;
    const vehicleInvoices = invoicesByVehicle.get(vehicle.id) ?? [];
    const currencies = new Set(
      vehicleInvoices.map((row) => row.currency?.trim().toUpperCase() || null),
    );
    const singleCurrency =
      currencies.size === 1 ? Array.from(currencies)[0] : null;
    const canPresentOutstandingAmount =
      vehicleInvoices.length > 0 && singleCurrency !== null;
    let createWorkOrderHref: string | null = null;
    if (
      permissions.canCreateWorkOrder &&
      accountRow?.active &&
      !accountRow.archived_at &&
      !accountRow.merged_into_customer_id &&
      !BLOCKED_CREATE_WORK_ORDER_VEHICLE_STATUSES.has(
        normalizedState(vehicle.status),
      )
    ) {
      createWorkOrderHref = createWorkOrderHandoffHref({
        customerId: accountRow.id,
        vehicleId: vehicle.id,
      });
    }

    group.vehicles.push({
      vehicle: toVehicleIdentity(vehicle),
      currentAccount: accountRow
        ? { id: accountRow.id, displayName: customerAccountDisplayName(accountRow) }
        : null,
      latestOdometer: odometer,
      activeWork: (activeWorkOrdersByVehicle.get(vehicle.id) ?? []).map((row) => ({
        kind: workOrderIsEstimate(row) ? "estimate" : "work_order",
        title: workOrderTitle(row),
        status: workOrderDisplayStatus(row),
        reference: {
          sourceType: "work_order",
          sourceId: row.id,
          sourceLabel: workOrderTitle(row),
          href: workOrderHref(row),
        },
      })),
      nextAppointment: appointmentByVehicle.has(vehicle.id)
        ? appointmentSummary(appointmentByVehicle.get(vehicle.id)!)
        : null,
      attentionCount: attentionCountByVehicle.get(vehicle.id) ?? 0,
      ...(permissions.canViewFinancials && vehicleInvoices.length > 0
        ? canPresentOutstandingAmount
          ? {
              outstandingAmount: vehicleInvoices.reduce(
                (total, row) => total + Number(row.outstanding_total ?? 0),
                0,
              ),
              currency: singleCurrency,
            }
          : { currency: null }
        : {}),
      workspaceHref: `/vehicles/${vehicle.id}`,
      createWorkOrderHref,
    });
  }

  const expandedCustomerIds = new Set(
    expandedCustomerVehicles
      .map((row) => row.customer_id)
      .filter((id): id is string => Boolean(id)),
  );
  // Restricted roles may use safe account names to expand vehicle-scoped cards,
  // but an unmatched account ID must never become an account-only response.
  const accountsWithoutVehicles =
    isMechanic || !permissions.canViewAccountContact
      ? []
      : matchedCustomers
          .filter((row) => !expandedCustomerIds.has(row.id))
          .map(toAccountSummary);

  return {
    query,
    groups: Array.from(groupMap.values()),
    accountsWithoutVehicles,
    permissions,
  };
}
