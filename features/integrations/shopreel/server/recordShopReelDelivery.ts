import { createAdminClient } from "./createAdminClient";
import type { ProFixIQStoryEvent } from "../types";

type DeliveryStatus = "pending" | "success" | "failed";

export async function createShopReelDeliveryLog(args: {
  shopId: string;
  integrationId: string | null;
  event: ProFixIQStoryEvent;
  requestUrl: string;
}) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("shopreel_event_deliveries")
    .insert({
      shop_id: args.shopId,
      integration_id: args.integrationId,
      event_key: args.event.eventId,
      event_type: args.event.eventType,
      payload: args.event,
      request_url: args.requestUrl,
      status: "pending",
      attempt_count: 1,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data?.id as string;
}

export async function finalizeShopReelDeliveryLog(args: {
  deliveryId: string;
  status: DeliveryStatus;
  httpStatus?: number | null;
  responseBody?: string | null;
  errorMessage?: string | null;
}) {
  const supabase = createAdminClient();

  const payload = {
    status: args.status,
    http_status: args.httpStatus ?? null,
    response_body: args.responseBody ?? null,
    error_message: args.errorMessage ?? null,
    delivered_at: args.status === "success" ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("shopreel_event_deliveries")
    .update(payload)
    .eq("id", args.deliveryId);

  if (error) {
    throw error;
  }
}
