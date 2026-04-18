import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import { signShopReelPayload } from "@/features/integrations/shopreel/server/signShopReelPayload";

type DB = Database;

async function getOwnerShopContext() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message, status: 500 as const };
  }

  if (!membership?.shop_id) {
    return { error: "Owner shop membership not found.", status: 403 as const };
  }

  return {
    shopId: membership.shop_id as string,
  };
}

export async function POST(request: NextRequest) {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { shopId } = context;
  const body = await request.json().catch(() => null);
  const deliveryId =
    typeof body?.deliveryId === "string" && body.deliveryId.trim().length > 0
      ? body.deliveryId.trim()
      : null;

  if (!deliveryId) {
    return NextResponse.json({ error: "Missing deliveryId." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: delivery, error: deliveryError } = await admin
    .from("shopreel_event_deliveries")
    .select("id, shop_id, integration_id, event_type, payload, request_url, attempt_count")
    .eq("id", deliveryId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (deliveryError) {
    return NextResponse.json({ error: deliveryError.message }, { status: 500 });
  }

  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
  }

  const { data: integration, error: integrationError } = await admin
    .from("shopreel_integrations")
    .select("id, remote_shop_id, shopreel_base_url, enabled, last_success_at")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json({ error: integrationError.message }, { status: 500 });
  }

  if (!integration?.id || !integration.remote_shop_id) {
    return NextResponse.json(
      { error: "ShopReel integration is missing a remote shop ID." },
      { status: 400 }
    );
  }

  if (!integration.enabled) {
    return NextResponse.json(
      { error: "Enable the ShopReel integration before retrying a delivery." },
      { status: 400 }
    );
  }

  const payloadObject =
    delivery.payload && typeof delivery.payload === "object" && !Array.isArray(delivery.payload)
      ? delivery.payload
      : null;

  if (!payloadObject) {
    return NextResponse.json(
      { error: "Stored delivery payload is missing or invalid." },
      { status: 400 }
    );
  }

  const requestUrl =
    typeof delivery.request_url === "string" && delivery.request_url.trim().length > 0
      ? delivery.request_url.trim()
      : `${
          (integration.shopreel_base_url || process.env.SHOPREEL_BASE_URL || "https://shopreel.profixiq.com").replace(/\/+$/, "")
        }/api/integrations/profixiq/events`;

  const payload = JSON.stringify({
    ...payloadObject,
    destination: {
      remoteShopId: integration.remote_shop_id,
    },
  });

  const secret = process.env.SHOPREEL_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing SHOPREEL_SHARED_SECRET." }, { status: 500 });
  }

  const timestamp = new Date().toISOString();
  const signature = signShopReelPayload(payload, timestamp, secret);

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-profixiq-timestamp": timestamp,
        "x-profixiq-signature": signature,
        "x-profixiq-shop-id": shopId,
      },
      body: payload,
    });

    const responseBody = await response.text();
    const nextAttemptCount =
      typeof delivery.attempt_count === "number" && Number.isFinite(delivery.attempt_count)
        ? delivery.attempt_count + 1
        : 1;

    await admin
      .from("shopreel_event_deliveries")
      .update({
        status: response.ok ? "success" : "failed",
        http_status: response.status,
        response_body: responseBody || null,
        error_message: response.ok ? null : `ShopReel responded with ${response.status}`,
        delivered_at: response.ok ? new Date().toISOString() : null,
        attempt_count: nextAttemptCount,
      })
      .eq("id", delivery.id);

    await admin
      .from("shopreel_integrations")
      .update({
        last_success_at: response.ok ? new Date().toISOString() : integration.last_success_at,
        last_error_at: response.ok ? null : new Date().toISOString(),
        last_error_message: response.ok ? null : `ShopReel responded with ${response.status}`,
      })
      .eq("id", integration.id);

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Retried successfully." : responseBody || "Retry failed.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ShopReel retry error.";

    const nextAttemptCount =
      typeof delivery.attempt_count === "number" && Number.isFinite(delivery.attempt_count)
        ? delivery.attempt_count + 1
        : 1;

    await admin
      .from("shopreel_event_deliveries")
      .update({
        status: "failed",
        error_message: message,
        attempt_count: nextAttemptCount,
      })
      .eq("id", delivery.id);

    await admin
      .from("shopreel_integrations")
      .update({
        last_error_at: new Date().toISOString(),
        last_error_message: message,
      })
      .eq("id", integration.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
