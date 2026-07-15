import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import type {
  AssistantAskContext,
  AssistantAskSession,
  AssistantResolvedContext,
  AssistantVehicleContext,
} from "../types";

type DB = Database;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAGE_TITLES: Record<string, string> = {
  work_order: "Work Order",
  customer: "Customer",
  vehicle: "Vehicle",
  booking: "Booking",
  dashboard: "Dashboard",
  mobile: "Mobile",
};

export class AssistantContextValidationError extends Error {
  constructor(message = "The active assistant context is invalid or unavailable") {
    super(message);
    this.name = "AssistantContextValidationError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function selectRawAssistantContext(args: {
  context?: AssistantAskContext;
  session?: AssistantAskSession;
}): AssistantResolvedContext {
  const current = args.context ?? {};
  const hasCurrentRecord = Boolean(
    current.workOrderId || current.customerId || current.vehicleId ||
      current.bookingId || current.fleetUnitId,
  );
  const source = hasCurrentRecord ? current : (args.session ?? {});
  return {
    workOrderId: source.workOrderId,
    customerId: source.customerId,
    vehicleId: source.vehicleId,
    bookingId: source.bookingId,
    fleetUnitId: source.fleetUnitId,
  };
}

export function sanitizeAssistantPageContext(
  context?: AssistantAskContext,
): Pick<AssistantAskContext, "pageType" | "pageTitle"> {
  const pageType = typeof context?.pageType === "string" && PAGE_TITLES[context.pageType]
    ? context.pageType
    : undefined;
  return pageType ? { pageType, pageTitle: PAGE_TITLES[pageType] } : {};
}

function requireValidIds(context: AssistantResolvedContext): void {
  for (const value of Object.values(context)) {
    if (value !== undefined && !isUuid(value)) {
      throw new AssistantContextValidationError();
    }
  }
}

function assertSame(label: string, left?: string | null, right?: string | null): void {
  if (left && right && left !== right) {
    throw new AssistantContextValidationError(
      `The active ${label} does not belong to the other selected records`,
    );
  }
}

export async function resolveTrustedAssistantContext(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  context?: AssistantAskContext;
  session?: AssistantAskSession;
}): Promise<{
  context: AssistantResolvedContext;
  vehicle?: AssistantVehicleContext;
}> {
  const candidate = selectRawAssistantContext(args);
  requireValidIds(candidate);

  const [workOrderResult, bookingResult, customerResult, vehicleResult, fleetVehicleResult] =
    await Promise.all([
      candidate.workOrderId
        ? args.supabase.from("work_orders").select("id,customer_id,vehicle_id")
            .eq("id", candidate.workOrderId).eq("shop_id", args.shopId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.bookingId
        ? args.supabase.from("bookings").select("id,customer_id,vehicle_id,work_order_id")
            .eq("id", candidate.bookingId).eq("shop_id", args.shopId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.customerId
        ? args.supabase.from("customers").select("id")
            .eq("id", candidate.customerId).eq("shop_id", args.shopId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.vehicleId
        ? args.supabase.from("vehicles").select("id,customer_id,year,make,model")
            .eq("id", candidate.vehicleId).eq("shop_id", args.shopId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.fleetUnitId
        ? args.supabase.from("vehicles").select("id,customer_id,year,make,model")
            .eq("id", candidate.fleetUnitId).eq("shop_id", args.shopId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  for (const result of [
    workOrderResult,
    bookingResult,
    customerResult,
    vehicleResult,
    fleetVehicleResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  if (candidate.workOrderId && !workOrderResult.data) throw new AssistantContextValidationError();
  if (candidate.bookingId && !bookingResult.data) throw new AssistantContextValidationError();
  if (candidate.customerId && !customerResult.data) throw new AssistantContextValidationError();
  if (candidate.vehicleId && !vehicleResult.data) throw new AssistantContextValidationError();
  if (candidate.fleetUnitId && !fleetVehicleResult.data) throw new AssistantContextValidationError();

  const trusted: AssistantResolvedContext = {};
  if (bookingResult.data) {
    trusted.bookingId = bookingResult.data.id;
    trusted.workOrderId = bookingResult.data.work_order_id ?? undefined;
    trusted.customerId = bookingResult.data.customer_id ?? undefined;
    trusted.vehicleId = bookingResult.data.vehicle_id ?? undefined;
  }
  if (workOrderResult.data) {
    assertSame("work order", trusted.workOrderId, workOrderResult.data.id);
    assertSame("customer", trusted.customerId, workOrderResult.data.customer_id);
    assertSame("vehicle", trusted.vehicleId, workOrderResult.data.vehicle_id);
    trusted.workOrderId = workOrderResult.data.id;
    trusted.customerId = workOrderResult.data.customer_id ?? trusted.customerId;
    trusted.vehicleId = workOrderResult.data.vehicle_id ?? trusted.vehicleId;
  }
  if (candidate.customerId) {
    assertSame("customer", trusted.customerId, candidate.customerId);
    trusted.customerId = candidate.customerId;
  }
  if (vehicleResult.data) {
    assertSame("vehicle", trusted.vehicleId, vehicleResult.data.id);
    assertSame("customer", trusted.customerId, vehicleResult.data.customer_id);
    trusted.vehicleId = vehicleResult.data.id;
    trusted.customerId = vehicleResult.data.customer_id ?? trusted.customerId;
  }
  if (fleetVehicleResult.data) {
    assertSame("vehicle", trusted.vehicleId, fleetVehicleResult.data.id);
    assertSame("customer", trusted.customerId, fleetVehicleResult.data.customer_id);
    trusted.fleetUnitId = fleetVehicleResult.data.id;
    trusted.vehicleId = fleetVehicleResult.data.id;
    trusted.customerId = fleetVehicleResult.data.customer_id ?? trusted.customerId;
  }

  if (trusted.workOrderId && workOrderResult.data?.id !== trusted.workOrderId) {
    const { data, error } = await args.supabase.from("work_orders")
      .select("id,customer_id,vehicle_id")
      .eq("id", trusted.workOrderId).eq("shop_id", args.shopId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AssistantContextValidationError();
    assertSame("customer", trusted.customerId, data.customer_id);
    assertSame("vehicle", trusted.vehicleId, data.vehicle_id);
    trusted.customerId = data.customer_id ?? trusted.customerId;
    trusted.vehicleId = data.vehicle_id ?? trusted.vehicleId;
  }

  let canonicalVehicle = vehicleResult.data ?? fleetVehicleResult.data;
  if (trusted.vehicleId && canonicalVehicle?.id !== trusted.vehicleId) {
    const { data, error } = await args.supabase.from("vehicles")
      .select("id,customer_id,year,make,model")
      .eq("id", trusted.vehicleId).eq("shop_id", args.shopId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AssistantContextValidationError();
    assertSame("customer", trusted.customerId, data.customer_id);
    canonicalVehicle = data;
  }

  if (trusted.customerId && customerResult.data?.id !== trusted.customerId) {
    const { data, error } = await args.supabase.from("customers").select("id")
      .eq("id", trusted.customerId).eq("shop_id", args.shopId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AssistantContextValidationError();
  }

  return {
    context: trusted,
    vehicle: canonicalVehicle
      ? {
          year: canonicalVehicle.year == null ? null : String(canonicalVehicle.year),
          make: canonicalVehicle.make,
          model: canonicalVehicle.model,
        }
      : undefined,
  };
}
