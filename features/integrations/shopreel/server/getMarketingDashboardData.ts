import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import {
  getDefaultShopReelEventTypes,
  sanitizeShopReelEventTypes,
} from "../constants";

type DB = Database;

export async function getMarketingDashboardData() {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      reason: "You must be signed in.",
    } as const;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.shop_id) {
    return {
      authorized: false,
      reason: "Owner access is required.",
    } as const;
  }

  const shopId = membership.shop_id;

  const [{ data: integration }, { data: deliveries }] = await Promise.all([
    supabase
      .from("shopreel_integrations")
      .select("*")
      .eq("shop_id", shopId)
      .maybeSingle(),
    supabase
      .from("shopreel_event_deliveries")
      .select("id, event_key, event_type, status, http_status, delivered_at, error_message, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  return {
    authorized: true,
    shopId,
    integration: integration
      ? {
          enabled: integration.enabled,
          shopreelBaseUrl: integration.shopreel_base_url,
          remoteShopId: integration.remote_shop_id,
          lastTestedAt: integration.last_tested_at,
          lastSuccessAt: integration.last_success_at,
          lastErrorAt: integration.last_error_at,
          lastErrorMessage: integration.last_error_message,
          enabledEventTypes: sanitizeShopReelEventTypes(integration.enabled_event_types),
        }
      : {
          enabled: false,
          shopreelBaseUrl:
            process.env.SHOPREEL_BASE_URL ?? "https://shopreel.profixiq.com",
          remoteShopId: null,
          lastTestedAt: null,
          lastSuccessAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          enabledEventTypes: getDefaultShopReelEventTypes(),
        },
    deliveries:
      deliveries?.map((delivery) => ({
        id: delivery.id,
        eventKey: delivery.event_key,
        eventType: delivery.event_type,
        status: delivery.status,
        httpStatus: delivery.http_status,
        deliveredAt: delivery.delivered_at,
        errorMessage: delivery.error_message,
        createdAt: delivery.created_at,
      })) ?? [],
  } as const;
}
