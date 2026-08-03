import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export const CONVERSATION_CONTEXT_TYPES = [
  "work_order",
  "customer",
  "vehicle",
  "booking",
  "inspection",
] as const;

export type ConversationContextType = (typeof CONVERSATION_CONTEXT_TYPES)[number];

export type ConversationContextAnchors = {
  context_type: ConversationContextType | null;
  context_id: string | null;
  customer_id: string | null;
  work_order_id: string | null;
  vehicle_id: string | null;
  booking_id: string | null;
};

type ContextResult =
  | { ok: true; anchors: ConversationContextAnchors }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

const emptyAnchors: ConversationContextAnchors = {
  context_type: null,
  context_id: null,
  customer_id: null,
  work_order_id: null,
  vehicle_id: null,
  booking_id: null,
};

function isContextType(value: string): value is ConversationContextType {
  return CONVERSATION_CONTEXT_TYPES.includes(value as ConversationContextType);
}

function validateCustomerOwnership(
  recordCustomerId: string | null,
  conversationCustomerId: string | null,
): ContextResult | null {
  if (
    conversationCustomerId &&
    recordCustomerId &&
    recordCustomerId !== conversationCustomerId
  ) {
    return { ok: false, status: 403, error: "Linked record belongs to another customer" };
  }
  return null;
}

export async function authorizeConversationContext({
  supabase,
  shopId,
  customerId,
  contextType,
  contextId,
}: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  customerId: string | null;
  contextType: string | null | undefined;
  contextId: string | null | undefined;
}): Promise<ContextResult> {
  const normalizedType = contextType?.trim() ?? "";
  const normalizedId = contextId?.trim() ?? "";

  if (!normalizedType && !normalizedId) {
    return {
      ok: true,
      anchors: customerId ? { ...emptyAnchors, customer_id: customerId } : emptyAnchors,
    };
  }

  if (!normalizedType || !normalizedId || !isContextType(normalizedType)) {
    return { ok: false, status: 400, error: "A supported context type and ID are required together" };
  }

  if (normalizedType === "customer") {
    const { data, error } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("id", normalizedId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 404, error: "Customer context not found in this shop" };
    const ownership = validateCustomerOwnership(data.id, customerId);
    if (ownership) return ownership;
    return {
      ok: true,
      anchors: {
        ...emptyAnchors,
        context_type: normalizedType,
        context_id: data.id,
        customer_id: data.id,
      },
    };
  }

  if (normalizedType === "work_order") {
    const { data, error } = await supabase
      .from("work_orders")
      .select("id, shop_id, customer_id, vehicle_id")
      .eq("id", normalizedId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 404, error: "Work order context not found in this shop" };
    const ownership = validateCustomerOwnership(data.customer_id, customerId);
    if (ownership) return ownership;
    return {
      ok: true,
      anchors: {
        ...emptyAnchors,
        context_type: normalizedType,
        context_id: data.id,
        customer_id: customerId ?? data.customer_id,
        work_order_id: data.id,
        vehicle_id: data.vehicle_id,
      },
    };
  }

  if (normalizedType === "vehicle") {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, shop_id, customer_id")
      .eq("id", normalizedId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 404, error: "Vehicle context not found in this shop" };
    const ownership = validateCustomerOwnership(data.customer_id, customerId);
    if (ownership) return ownership;
    return {
      ok: true,
      anchors: {
        ...emptyAnchors,
        context_type: normalizedType,
        context_id: data.id,
        customer_id: customerId ?? data.customer_id,
        vehicle_id: data.id,
      },
    };
  }

  if (normalizedType === "booking") {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, shop_id, customer_id, vehicle_id, work_order_id")
      .eq("id", normalizedId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 404, error: "Booking context not found in this shop" };
    const ownership = validateCustomerOwnership(data.customer_id, customerId);
    if (ownership) return ownership;
    return {
      ok: true,
      anchors: {
        ...emptyAnchors,
        context_type: normalizedType,
        context_id: data.id,
        customer_id: customerId ?? data.customer_id,
        booking_id: data.id,
        vehicle_id: data.vehicle_id,
        work_order_id: data.work_order_id,
      },
    };
  }

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("id, shop_id, vehicle_id, work_order_id")
    .eq("id", normalizedId)
    .eq("shop_id", shopId)
    .eq("is_canonical", true)
    .maybeSingle();
  if (inspectionError) return { ok: false, status: 500, error: inspectionError.message };
  if (!inspection) return { ok: false, status: 404, error: "Inspection context not found in this shop" };

  let inspectionCustomerId: string | null = null;
  if (inspection.work_order_id) {
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("customer_id")
      .eq("id", inspection.work_order_id)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (workOrderError) return { ok: false, status: 500, error: workOrderError.message };
    inspectionCustomerId = workOrder?.customer_id ?? null;
  }
  const ownership = validateCustomerOwnership(inspectionCustomerId, customerId);
  if (ownership) return ownership;

  return {
    ok: true,
    anchors: {
      ...emptyAnchors,
      context_type: normalizedType,
      context_id: inspection.id,
      customer_id: customerId ?? inspectionCustomerId,
      work_order_id: inspection.work_order_id,
      vehicle_id: inspection.vehicle_id,
    },
  };
}
