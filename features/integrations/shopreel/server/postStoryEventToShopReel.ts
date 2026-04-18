import { createAdminClient } from "./createAdminClient";
import { getShopReelIntegrationForShop } from "./getShopReelIntegrationForShop";
import { createShopReelDeliveryLog, finalizeShopReelDeliveryLog } from "./recordShopReelDelivery";
import { sanitizeProFixIQStoryEvent } from "./sanitizeProFixIQStoryEvent";
import { signShopReelPayload } from "./signShopReelPayload";
import type { ProFixIQStoryEvent } from "../types";
import { sanitizeShopReelEventTypes } from "../constants";

function buildIngestUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/api/integrations/profixiq/events`;
}

export async function postStoryEventToShopReel(
  event: ProFixIQStoryEvent
): Promise<{ skipped?: boolean; ok: boolean; status?: number; message?: string }> {
  const integration = await getShopReelIntegrationForShop(event.source.shopId);

  if (!integration || !integration.enabled) {
    return {
      skipped: true,
      ok: true,
      message: "ShopReel integration is disabled for this shop.",
    };
  }

  const enabledEventTypes = sanitizeShopReelEventTypes(integration.enabled_event_types);

  if (!enabledEventTypes.includes(event.eventType)) {
    return {
      skipped: true,
      ok: true,
      message: "Event type is disabled for this shop.",
    };
  }

  if (!integration.remote_shop_id) {
    const message = "ShopReel integration is missing a remote shop ID.";
    const supabase = createAdminClient();
    await supabase
      .from("shopreel_integrations")
      .update({
        last_error_at: new Date().toISOString(),
        last_error_message: message,
      })
      .eq("id", integration.id);

    return {
      skipped: true,
      ok: true,
      message,
    };
  }

  const secret = process.env.SHOPREEL_SHARED_SECRET;
  if (!secret) {
    throw new Error("Missing SHOPREEL_SHARED_SECRET.");
  }

  const sanitized = sanitizeProFixIQStoryEvent(event);
  const requestUrl = buildIngestUrl(
    integration.shopreel_base_url || process.env.SHOPREEL_BASE_URL || "https://shopreel.profixiq.com"
  );
  const payload = JSON.stringify({
    ...sanitized,
    destination: {
      remoteShopId: integration.remote_shop_id,
    },
  });

  const timestamp = new Date().toISOString();
  const signature = signShopReelPayload(payload, timestamp, secret);
  const deliveryId = await createShopReelDeliveryLog({
    shopId: event.source.shopId,
    integrationId: integration.id,
    event: sanitized,
    requestUrl,
  });

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-profixiq-timestamp": timestamp,
        "x-profixiq-signature": signature,
        "x-profixiq-shop-id": event.source.shopId,
      },
      body: payload,
    });

    const responseBody = await response.text();

    await finalizeShopReelDeliveryLog({
      deliveryId,
      status: response.ok ? "success" : "failed",
      httpStatus: response.status,
      responseBody,
      errorMessage: response.ok ? null : `ShopReel responded with ${response.status}`,
    });

    const supabase = createAdminClient();
    await supabase
      .from("shopreel_integrations")
      .update({
        last_success_at: response.ok ? new Date().toISOString() : integration.last_success_at,
        last_error_at: response.ok ? null : new Date().toISOString(),
        last_error_message: response.ok ? null : `ShopReel responded with ${response.status}`,
      })
      .eq("id", integration.id);

    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Delivered to ShopReel." : responseBody || "Delivery failed.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ShopReel delivery error.";

    await finalizeShopReelDeliveryLog({
      deliveryId,
      status: "failed",
      errorMessage: message,
    });

    const supabase = createAdminClient();
    await supabase
      .from("shopreel_integrations")
      .update({
        last_error_at: new Date().toISOString(),
        last_error_message: message,
      })
      .eq("id", integration.id);

    throw error;
  }
}
