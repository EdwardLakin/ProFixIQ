import "server-only";

import {
  AssistantContextValidationError,
  resolveTrustedAssistantContext,
} from "@/features/agent/assistant/server/trustedContext";
import { loadTechnicianWorkCandidateForWorkOrder } from "@/features/copilot/technician/server/assignedWork";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  ShopAssistantContext,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";

const PAGE_TITLES: Record<string, string> = {
  assistant: "Shop Assistant",
  dashboard: "Dashboard",
  work_order: "Work Order",
  work_orders: "Work Orders",
  customer: "Customer",
  customers: "Customers",
  vehicle: "Vehicle",
  vehicles: "Vehicles",
  booking: "Appointment",
  scheduling: "Scheduling",
  inventory: "Parts Inventory",
  parts_requests: "Parts Requests",
  purchasing: "Purchasing",
  billing: "Billing",
  invoice: "Invoice",
  invoices: "Invoices",
  workforce: "Workforce",
  inspections: "Inspections",
  fleet: "Fleet",
  property: "Property",
  marketing: "Marketing",
  reviews: "Reviews",
  settings: "Settings",
  mobile: "Mobile",
};

const BILLING_CONTEXT_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
]);

function hasRecordContext(context?: ShopAssistantContext): boolean {
  return Boolean(
    context?.workOrderId ||
    context?.customerId ||
    context?.vehicleId ||
    context?.bookingId ||
    context?.invoiceId,
  );
}

function assertSame(
  label: string,
  left?: string | null,
  right?: string | null,
): void {
  if (left && right && left !== right) {
    throw new ShopAssistantHttpError(
      400,
      `The active ${label} does not belong to the other selected records.`,
    );
  }
}

async function assertFleetContextAccess(params: {
  actor: ShopAssistantActor;
  context: Awaited<
    ReturnType<typeof resolveTrustedAssistantContext>
  >["context"];
}): Promise<void> {
  if (
    !params.actor.capabilities.canViewFleetOnlyData ||
    params.actor.capabilities.canViewShopWideData
  ) {
    return;
  }
  if (!Object.values(params.context).some(Boolean)) return;

  const fleetActor = await resolveFleetActorContext(createAdminSupabase(), {
    userId: params.actor.userId,
    profileId: params.actor.profileId,
  });
  const vehicleId = params.context.vehicleId;
  if (!vehicleId || fleetActor.fleetIds.length === 0) {
    throw new ShopAssistantHttpError(
      403,
      "That record is outside your fleet access.",
    );
  }

  const { data, error } = await createAdminSupabase()
    .from("fleet_vehicles")
    .select("vehicle_id")
    .eq("shop_id", params.actor.shopId)
    .eq("vehicle_id", vehicleId)
    .in("fleet_id", fleetActor.fleetIds)
    .or("active.is.null,active.eq.true")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new ShopAssistantHttpError(
      403,
      "That record is outside your fleet access.",
    );
  }
}

async function assertMechanicContextAccess(params: {
  actor: ShopAssistantActor;
  context: Awaited<
    ReturnType<typeof resolveTrustedAssistantContext>
  >["context"];
}): Promise<void> {
  if (params.actor.canonicalRole !== "mechanic") return;
  if (!Object.values(params.context).some(Boolean)) return;

  const workOrderId = params.context.workOrderId;
  if (!workOrderId) {
    throw new ShopAssistantHttpError(
      403,
      "Mechanic assistant context must be one of your assigned work orders.",
    );
  }
  const assigned = await loadTechnicianWorkCandidateForWorkOrder({
    supabase: createAdminSupabase(),
    shopId: params.actor.shopId,
    technicianIds: [params.actor.userId, params.actor.profileId],
    workOrderId,
  });
  if (!assigned) {
    throw new ShopAssistantHttpError(
      403,
      "That work order is outside your assigned work.",
    );
  }
}

export async function resolveTrustedShopAssistantContext(params: {
  actor: ShopAssistantActor;
  requested?: ShopAssistantContext;
  stored: ShopAssistantThreadContext;
}): Promise<{
  pageContext: ShopAssistantContext;
  threadContext: ShopAssistantThreadContext;
}> {
  const storedAsPage: ShopAssistantContext = {
    workOrderId: params.stored.activeWorkOrderId,
    customerId: params.stored.activeCustomerId,
    vehicleId: params.stored.activeVehicleId,
    bookingId: params.stored.activeBookingId,
    invoiceId: params.stored.activeInvoiceId,
  };
  const source = hasRecordContext(params.requested)
    ? (params.requested ?? {})
    : storedAsPage;

  if (
    source.invoiceId &&
    !BILLING_CONTEXT_ROLES.has(params.actor.canonicalRole)
  ) {
    throw new ShopAssistantHttpError(
      403,
      "Your role cannot use invoice context in the shop assistant.",
    );
  }

  // Every candidate is still constrained by the authenticated actor's shop,
  // then narrowed again for mechanics and fleet-only users below. Using the
  // trusted client here keeps imported profiles (profiles.id != auth.uid())
  // from failing valid context resolution on legacy self-read policies.
  const admin = createAdminSupabase();

  let resolved: Awaited<ReturnType<typeof resolveTrustedAssistantContext>>;
  try {
    resolved = await resolveTrustedAssistantContext({
      supabase: admin,
      shopId: params.actor.shopId,
      context: {
        workOrderId: source.workOrderId,
        customerId: source.customerId,
        vehicleId: source.vehicleId,
        bookingId: source.bookingId,
      },
    });
  } catch (error) {
    if (error instanceof AssistantContextValidationError) {
      throw new ShopAssistantHttpError(400, error.message);
    }
    throw error;
  }

  let invoiceId: string | undefined;
  if (source.invoiceId) {
    const { data: invoice, error } = await admin
      .from("invoices")
      .select("id, work_order_id, customer_id")
      .eq("shop_id", params.actor.shopId)
      .eq("id", source.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) {
      throw new ShopAssistantHttpError(
        400,
        "The active invoice context is invalid or unavailable.",
      );
    }
    assertSame(
      "work order",
      resolved.context.workOrderId,
      invoice.work_order_id,
    );
    assertSame("customer", resolved.context.customerId, invoice.customer_id);
    invoiceId = invoice.id;

    if (invoice.work_order_id && !resolved.context.workOrderId) {
      const { data: workOrder, error: workOrderError } = await admin
        .from("work_orders")
        .select("id, customer_id, vehicle_id")
        .eq("shop_id", params.actor.shopId)
        .eq("id", invoice.work_order_id)
        .maybeSingle();
      if (workOrderError) throw new Error(workOrderError.message);
      if (!workOrder) {
        throw new ShopAssistantHttpError(
          400,
          "The invoice work order is invalid or unavailable.",
        );
      }
      resolved.context.workOrderId = workOrder.id;
      resolved.context.customerId =
        workOrder.customer_id ?? resolved.context.customerId;
      resolved.context.vehicleId =
        workOrder.vehicle_id ?? resolved.context.vehicleId;
    } else if (invoice.customer_id && !resolved.context.customerId) {
      resolved.context.customerId = invoice.customer_id;
    }
  }

  await assertFleetContextAccess({
    actor: params.actor,
    context: resolved.context,
  });
  await assertMechanicContextAccess({
    actor: params.actor,
    context: resolved.context,
  });

  const requestedPageType = params.requested?.pageType?.trim().toLowerCase();
  const pageType =
    requestedPageType && PAGE_TITLES[requestedPageType]
      ? requestedPageType
      : "assistant";
  const pageContext: ShopAssistantContext = {
    workOrderId: resolved.context.workOrderId,
    customerId: resolved.context.customerId,
    vehicleId: resolved.context.vehicleId,
    bookingId: resolved.context.bookingId,
    invoiceId,
    pageType,
    pageTitle: PAGE_TITLES[pageType],
  };

  return {
    pageContext,
    threadContext: {
      activeWorkOrderId: pageContext.workOrderId,
      activeCustomerId: pageContext.customerId,
      activeVehicleId: pageContext.vehicleId,
      activeBookingId: pageContext.bookingId,
      activeInvoiceId: pageContext.invoiceId,
      lastDomain: params.stored.lastDomain,
      lastIntent: params.stored.lastIntent,
    },
  };
}
