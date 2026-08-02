import "server-only";

import type { Json, Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { estimateActorForRole } from "@/features/estimates/lib/access";
import { isEstimateStatus } from "@/features/estimates/lib/status";
import { isPartsRequestItemPriced } from "@/features/parts/lib/status-display";
import type {
  EstimateCustomerForm,
  EstimateDetail,
  EstimateEvent,
  EstimateLineDraft,
  EstimateListItem,
  EstimateListPayload,
  EstimatePartDraft,
  EstimatePartRequest,
  EstimateRequestItem,
  EstimateVehicleForm,
} from "@/features/estimates/types";

type DB = Database;
type ServerSupabase = ReturnType<typeof createServerSupabaseRoute>;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type PartRequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type EstimateEventRow = DB["public"]["Tables"]["estimate_events"]["Row"];
type EstimateInternalDetailsRow =
  DB["public"]["Tables"]["estimate_internal_details"]["Row"];

type CustomerSummary = Pick<
  CustomerRow,
  | "id"
  | "business_name"
  | "name"
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "address"
  | "city"
  | "province"
  | "postal_code"
>;

type VehicleSummary = Pick<
  VehicleRow,
  | "id"
  | "year"
  | "make"
  | "model"
  | "vin"
  | "license_plate"
  | "mileage"
  | "color"
  | "unit_number"
  | "engine_hours"
  | "engine"
  | "transmission"
  | "fuel_type"
  | "drivetrain"
>;

type EstimateJoinedRow = Pick<
  WorkOrderRow,
  | "id"
  | "estimate_number"
  | "estimate_status"
  | "estimate_revision"
  | "record_type"
  | "custom_id"
  | "customer_id"
  | "vehicle_id"
  | "advisor_id"
  | "notes"
  | "labor_total"
  | "parts_total"
  | "created_at"
  | "updated_at"
  | "estimate_expires_at"
  | "estimate_sent_at"
> & {
  customers: CustomerSummary | CustomerSummary[] | null;
  vehicles: VehicleSummary | VehicleSummary[] | null;
};

const ESTIMATE_SELECT = `
  id,
  estimate_number,
  estimate_status,
  estimate_revision,
  record_type,
  custom_id,
  customer_id,
  vehicle_id,
  advisor_id,
  notes,
  labor_total,
  parts_total,
  created_at,
  updated_at,
  estimate_expires_at,
  estimate_sent_at,
  customers (
    id,
    business_name,
    name,
    first_name,
    last_name,
    phone,
    email,
    address,
    city,
    province,
    postal_code
  ),
  vehicles (
    id,
    year,
    make,
    model,
    vin,
    license_plate,
    mileage,
    color,
    unit_number,
    engine_hours,
    engine,
    transmission,
    fuel_type,
    drivetrain
  )
`;

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function customerDisplayName(customer: CustomerSummary | null): string {
  if (!customer) return "Unknown customer";
  return (
    asText(customer.business_name) ||
    [customer.first_name, customer.last_name]
      .map(asText)
      .filter(Boolean)
      .join(" ") ||
    asText(customer.name) ||
    "Unnamed customer"
  );
}

function vehicleDisplayLabel(vehicle: VehicleSummary | null): string {
  if (!vehicle) return "Unknown vehicle";
  return (
    [
      vehicle.year == null ? "" : String(vehicle.year),
      vehicle.make,
      vehicle.model,
    ]
      .map(asText)
      .filter(Boolean)
      .join(" ") ||
    asText(vehicle.unit_number) ||
    asText(vehicle.license_plate) ||
    asText(vehicle.vin) ||
    "Unnamed vehicle"
  );
}

function metadataObject(value: Json | null): {
  [key: string]: Json | undefined;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function requestedParts(metadata: {
  [key: string]: Json | undefined;
}): EstimatePartDraft[] {
  const raw = metadata.requested_parts;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const description = asText(entry.description);
    if (!description) return [];
    return [
      {
        clientKey: asText(entry.clientKey) || `legacy-part-${index + 1}`,
        description,
        quantity: Math.max(1, asNumber(entry.quantity) || 1),
        partNumber: asText(entry.partNumber),
        manufacturer: asText(entry.manufacturer),
      },
    ];
  });
}

function customerPayload(
  customer: CustomerSummary | null,
  redactContact: boolean,
): EstimateCustomerForm {
  return {
    id: customer?.id ?? null,
    business_name: customer?.business_name ?? null,
    name: customer?.name ?? null,
    first_name: customer?.first_name ?? null,
    last_name: customer?.last_name ?? null,
    phone: redactContact ? null : (customer?.phone ?? null),
    email: redactContact ? null : (customer?.email ?? null),
    address: redactContact ? null : (customer?.address ?? null),
    city: redactContact ? null : (customer?.city ?? null),
    province: redactContact ? null : (customer?.province ?? null),
    postal_code: redactContact ? null : (customer?.postal_code ?? null),
  };
}

function vehiclePayload(vehicle: VehicleSummary | null): EstimateVehicleForm {
  return {
    id: vehicle?.id ?? null,
    year: vehicle?.year == null ? null : String(vehicle.year),
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    vin: vehicle?.vin ?? null,
    license_plate: vehicle?.license_plate ?? null,
    mileage: vehicle?.mileage ?? null,
    color: vehicle?.color ?? null,
    unit_number: vehicle?.unit_number ?? null,
    engine_hours:
      vehicle?.engine_hours == null ? null : String(vehicle.engine_hours),
    engine: vehicle?.engine ?? null,
    transmission: vehicle?.transmission ?? null,
    fuel_type: vehicle?.fuel_type ?? null,
    drivetrain: vehicle?.drivetrain ?? null,
  };
}

function listItem(row: EstimateJoinedRow): EstimateListItem {
  const customer = firstRelation(row.customers);
  const vehicle = firstRelation(row.vehicles);
  const rawStatus = row.estimate_status;
  return {
    id: row.id,
    estimateNumber:
      row.estimate_number ?? `EST-${row.id.slice(0, 8).toUpperCase()}`,
    estimateStatus: isEstimateStatus(rawStatus) ? rawStatus : "draft",
    estimateRevision: row.estimate_revision,
    recordType: row.record_type,
    customId: row.custom_id,
    customerName: customerDisplayName(customer),
    vehicleLabel: vehicleDisplayLabel(vehicle),
    vehicleVin: vehicle?.vin ?? null,
    vehicleUnitNumber: vehicle?.unit_number ?? null,
    advisorId: row.advisor_id,
    laborTotal: asNumber(row.labor_total),
    partsTotal: asNumber(row.parts_total),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.estimate_expires_at,
  };
}

export async function loadEstimateList(input: {
  supabase: ServerSupabase;
  shopId: string;
  role: CanonicalRole;
}): Promise<EstimateListPayload> {
  const actor = estimateActorForRole(input.role);
  let query = input.supabase
    .from("work_orders")
    .select(ESTIMATE_SELECT)
    .eq("shop_id", input.shopId)
    .not("estimate_number", "is", null)
    .order("updated_at", { ascending: false })
    .limit(150);

  if (actor.mode === "parts") {
    query = query.eq("estimate_status", "waiting_for_parts");
  }

  const [estimateResult, shopResult] = await Promise.all([
    query.returns<EstimateJoinedRow[]>(),
    input.supabase
      .from("shops")
      .select("id,labor_rate")
      .eq("id", input.shopId)
      .maybeSingle<
        Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "labor_rate">
      >(),
  ]);

  if (estimateResult.error) throw new Error(estimateResult.error.message);
  if (shopResult.error) throw new Error(shopResult.error.message);

  return {
    actor,
    shop: {
      id: input.shopId,
      laborRate: asNumber(shopResult.data?.labor_rate),
    },
    estimates: (estimateResult.data ?? []).map((row) => {
      const item = listItem(row);
      return actor.mode === "parts" ? { ...item, laborTotal: 0 } : item;
    }),
  };
}

function linePayload(
  row: QuoteLineRow,
  shopLaborRate: number,
  redactFinancials: boolean,
  internalLineNotes: { [key: string]: Json | undefined },
): EstimateLineDraft {
  const metadata = metadataObject(row.metadata);
  const clientKey = asText(metadata.client_key) || row.id;
  const laborRate =
    asNumber(row.labor_rate) || asNumber(metadata.labor_rate) || shopLaborRate;
  return {
    id: row.id,
    clientKey,
    title: asText(row.title) || asText(row.description) || "Repair line",
    customerDescription:
      asText(metadata.customer_description) || asText(row.description),
    advisorNotes: asText(internalLineNotes[clientKey]) || asText(row.notes),
    laborHours: redactFinancials
      ? 0
      : asNumber(row.labor_hours) || asNumber(row.est_labor_hours),
    laborRate: redactFinancials ? 0 : laborRate,
    parts: requestedParts(metadata),
    status: row.status,
    stage: row.stage,
    partsTotal: asNumber(row.parts_total),
    grandTotal: redactFinancials
      ? asNumber(row.parts_total)
      : asNumber(row.grand_total),
    sentAt: row.sent_to_customer_at,
    approvedAt: row.approved_at,
    workOrderLineId: row.work_order_line_id,
  };
}

function requestItemPayload(
  row: PartRequestItemRow,
  includeInternalCost: boolean,
): EstimateRequestItem {
  return {
    id: row.id,
    requestId: row.request_id,
    quoteLineId: row.quote_line_id,
    sourceRowId: row.source_row_id,
    description: row.description,
    quantity: Math.max(asNumber(row.qty_requested), asNumber(row.qty), 1),
    requestedPartNumber: row.requested_part_number,
    requestedManufacturer: row.requested_manufacturer,
    quotedPrice: asNullableNumber(row.quoted_price ?? row.unit_price),
    unitCost: includeInternalCost ? asNullableNumber(row.unit_cost) : null,
    vendor: row.vendor,
    status: String(row.status),
    priced: isPartsRequestItemPriced({
      description: row.description,
      partId: row.part_id,
      requestedPartNumber: row.requested_part_number,
      requestedManufacturer: row.requested_manufacturer,
      qty: row.qty,
      qtyRequested: row.qty_requested,
      quotedPrice: row.quoted_price,
      unitPrice: row.unit_price,
    }),
  };
}

function requestPayload(
  request: PartRequestRow,
  items: PartRequestItemRow[],
  includeInternalCost: boolean,
): EstimatePartRequest {
  return {
    id: request.id,
    quoteLineId: request.quote_line_id,
    status: String(request.status),
    sourceRevision: request.source_revision,
    notes: request.notes,
    createdAt: request.created_at,
    items: items
      .filter(
        (item) =>
          item.request_id === request.id && String(item.status) !== "cancelled",
      )
      .map((item) => requestItemPayload(item, includeInternalCost)),
  };
}

function eventPayload(row: EstimateEventRow): EstimateEvent {
  return {
    id: row.id,
    revision: row.revision,
    eventType: row.event_type,
    reasonCode: row.reason_code,
    note: row.note,
    changedQuoteLineIds: row.changed_quote_line_ids,
    createdAt: row.created_at,
  };
}

export async function loadEstimateDetail(input: {
  supabase: ServerSupabase;
  shopId: string;
  role: CanonicalRole;
  workOrderId: string;
}): Promise<EstimateDetail | null> {
  const actor = estimateActorForRole(input.role);
  const includeInternalCost = ["owner", "admin", "manager", "parts"].includes(
    input.role,
  );
  const { data: estimateRow, error: estimateError } = await input.supabase
    .from("work_orders")
    .select(ESTIMATE_SELECT)
    .eq("id", input.workOrderId)
    .eq("shop_id", input.shopId)
    .not("estimate_number", "is", null)
    .maybeSingle<EstimateJoinedRow>();

  if (estimateError) throw new Error(estimateError.message);
  if (!estimateRow) return null;

  const [
    lineResult,
    requestResult,
    itemResult,
    eventResult,
    shopResult,
    internalDetailsResult,
  ] = await Promise.all([
    input.supabase
      .from("work_order_quote_lines")
      .select("*")
      .eq("shop_id", input.shopId)
      .eq("work_order_id", input.workOrderId)
      .order("created_at", { ascending: true })
      .returns<QuoteLineRow[]>(),
    input.supabase
      .from("part_requests")
      .select("*")
      .eq("shop_id", input.shopId)
      .eq("work_order_id", input.workOrderId)
      .eq("source_context", "estimate")
      .order("created_at", { ascending: true })
      .returns<PartRequestRow[]>(),
    input.supabase
      .from("part_request_items")
      .select("*")
      .eq("shop_id", input.shopId)
      .eq("work_order_id", input.workOrderId)
      .order("created_at", { ascending: true })
      .returns<PartRequestItemRow[]>(),
    input.supabase
      .from("estimate_events")
      .select("*")
      .eq("shop_id", input.shopId)
      .eq("work_order_id", input.workOrderId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<EstimateEventRow[]>(),
    input.supabase
      .from("shops")
      .select("id,labor_rate")
      .eq("id", input.shopId)
      .maybeSingle<
        Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "labor_rate">
      >(),
    input.supabase
      .from("estimate_internal_details")
      .select("notes,line_notes")
      .eq("shop_id", input.shopId)
      .eq("work_order_id", input.workOrderId)
      .maybeSingle<Pick<EstimateInternalDetailsRow, "notes" | "line_notes">>(),
  ]);

  const queryError =
    lineResult.error ??
    requestResult.error ??
    itemResult.error ??
    eventResult.error ??
    shopResult.error ??
    internalDetailsResult.error;
  if (queryError) throw new Error(queryError.message);

  const shopLaborRate = asNumber(shopResult.data?.labor_rate);
  const activeLines = (lineResult.data ?? []).filter(
    (line) =>
      !["cancelled", "superseded"].includes(String(line.status).toLowerCase()),
  );
  const currentRequests = (requestResult.data ?? []).filter(
    (request) =>
      request.source_revision === estimateRow.estimate_revision &&
      String(request.status).toLowerCase() !== "cancelled",
  );
  const customer = firstRelation(estimateRow.customers);
  const vehicle = firstRelation(estimateRow.vehicles);
  const rawStatus = estimateRow.estimate_status;
  const internalLineNotes = metadataObject(
    internalDetailsResult.data?.line_notes ?? null,
  );

  return {
    actor,
    shop: { id: input.shopId, laborRate: shopLaborRate },
    estimate: {
      id: estimateRow.id,
      estimateNumber:
        estimateRow.estimate_number ??
        `EST-${estimateRow.id.slice(0, 8).toUpperCase()}`,
      estimateStatus: isEstimateStatus(rawStatus) ? rawStatus : "draft",
      estimateRevision: estimateRow.estimate_revision,
      recordType: estimateRow.record_type,
      customId: estimateRow.custom_id,
      notes: internalDetailsResult.data?.notes ?? estimateRow.notes,
      expiresAt: estimateRow.estimate_expires_at,
      createdAt: estimateRow.created_at,
      updatedAt: estimateRow.updated_at,
      sentAt: estimateRow.estimate_sent_at,
      customer: customerPayload(customer, actor.mode === "parts"),
      vehicle: vehiclePayload(vehicle),
      lines: activeLines.map((line) =>
        linePayload(
          line,
          shopLaborRate,
          actor.mode === "parts",
          internalLineNotes,
        ),
      ),
      requests: currentRequests.map((request) =>
        requestPayload(request, itemResult.data ?? [], includeInternalCost),
      ),
      events: (eventResult.data ?? [])
        .filter(
          (event) =>
            !["send_reserved", "send_failed"].includes(event.event_type),
        )
        .map(eventPayload),
    },
  };
}
