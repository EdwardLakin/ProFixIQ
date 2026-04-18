import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import type { Database } from "@shared/types/types/supabase";
import { DEFAULT_SHOPREEL_EVENT_TYPES, getShopReelBaseUrl } from "./shopreelConfig";

type DB = Database;
type DeliveryStatus = "pending" | "success" | "failed";

type DeliveryRow = Pick<
  DB["public"]["Tables"]["shopreel_event_deliveries"]["Row"],
  "id" | "event_key" | "event_type" | "status" | "http_status" | "delivered_at" | "error_message" | "created_at"
>;

type PublicationRow = Pick<
  DB["public"]["Tables"]["shopreel_publications"]["Row"],
  "id" | "status"
>;

type PublishJobRow = Pick<
  DB["public"]["Tables"]["shopreel_publish_jobs"]["Row"],
  "id" | "status" | "error_message" | "run_after"
>;

type SocialConnectionRow = Pick<
  DB["public"]["Tables"]["shopreel_social_connections"]["Row"],
  "id" | "platform" | "connection_active" | "token_expires_at"
>;

type ManualAssetRow = Pick<
  DB["public"]["Tables"]["shopreel_manual_assets"]["Row"],
  "id" | "status" | "created_at"
>;

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inPastHours(value: string, hours: number) {
  const date = parseDate(value);
  if (!date) return false;

  const now = Date.now();
  return now - date.getTime() <= hours * 60 * 60 * 1000;
}

function toDeliveryStatus(value: string): DeliveryStatus {
  if (value === "success" || value === "failed" || value === "pending") {
    return value;
  }
  return "pending";
}

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

  const [
    { data: integration },
    { data: deliveries },
    { data: publications },
    { data: publishJobs },
    { data: socialConnections },
    { data: manualAssets },
  ] = await Promise.all([
    supabase.from("shopreel_integrations").select("*").eq("shop_id", shopId).maybeSingle(),
    supabase
      .from("shopreel_event_deliveries")
      .select("id, event_key, event_type, status, http_status, delivered_at, error_message, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("shopreel_publications").select("id, status").eq("shop_id", shopId).limit(200),
    supabase
      .from("shopreel_publish_jobs")
      .select("id, status, error_message, run_after")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("shopreel_social_connections")
      .select("id, platform, connection_active, token_expires_at")
      .eq("shop_id", shopId)
      .limit(50),
    supabase
      .from("shopreel_manual_assets")
      .select("id, status, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const typedDeliveries = (deliveries ?? []) as DeliveryRow[];
  const typedPublications = (publications ?? []) as PublicationRow[];
  const typedPublishJobs = (publishJobs ?? []) as PublishJobRow[];
  const typedSocialConnections = (socialConnections ?? []) as SocialConnectionRow[];
  const typedManualAssets = (manualAssets ?? []) as ManualAssetRow[];

  const successCount = typedDeliveries.filter((delivery) => toDeliveryStatus(delivery.status) === "success").length;
  const failedCount = typedDeliveries.filter((delivery) => toDeliveryStatus(delivery.status) === "failed").length;
  const pendingCount = typedDeliveries.filter((delivery) => toDeliveryStatus(delivery.status) === "pending").length;

  const stalePending = typedDeliveries.filter(
    (delivery) => toDeliveryStatus(delivery.status) === "pending" && !inPastHours(delivery.created_at, 3),
  ).length;

  const attempts = typedDeliveries.length;
  const successRatePct = attempts > 0 ? Math.round((successCount / attempts) * 100) : null;

  const deliveryByEventType = DEFAULT_SHOPREEL_EVENT_TYPES.map((eventType) => {
    const matching = typedDeliveries.filter((delivery) => delivery.event_type === eventType);
    const latest = matching[0] ?? null;

    return {
      eventType,
      attempts: matching.length,
      successes: matching.filter((delivery) => toDeliveryStatus(delivery.status) === "success").length,
      failures: matching.filter((delivery) => toDeliveryStatus(delivery.status) === "failed").length,
      lastSeenAt: latest?.created_at ?? null,
      lastStatus: latest ? toDeliveryStatus(latest.status) : null,
    };
  });

  const publicationsQueued = typedPublications.filter((item) => item.status === "queued").length;
  const publicationsScheduled = typedPublications.filter((item) => item.status === "scheduled").length;
  const publicationsPublishing = typedPublications.filter((item) => item.status === "publishing").length;
  const publicationsPublished = typedPublications.filter((item) => item.status === "published").length;
  const publicationsFailed = typedPublications.filter((item) => item.status === "failed").length;

  const publishJobsRunning = typedPublishJobs.filter((item) => item.status === "running").length;
  const publishJobsQueued = typedPublishJobs.filter((item) => item.status === "queued").length;
  const publishJobsFailed = typedPublishJobs.filter((item) => item.status === "failed").length;

  const activeConnections = typedSocialConnections.filter((item) => item.connection_active).length;
  const tokenExpiringSoon = typedSocialConnections.filter((item) => {
    const expiresAt = parseDate(item.token_expires_at);
    if (!expiresAt) return false;

    return expiresAt.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000;
  }).length;

  const draftManualAssets = typedManualAssets.filter((item) => item.status === "draft").length;

  const needsAttention: string[] = [];

  if (!(integration?.enabled ?? false)) {
    needsAttention.push("Integration is disabled. Enable ShopReel sync to start ingesting events.");
  }

  if (!integration?.remote_shop_id) {
    needsAttention.push("Remote ShopReel shop ID is missing, so delivered events may not map to a destination shop.");
  }

  if (failedCount > 0) {
    needsAttention.push(`${failedCount} recent delivery attempt${failedCount === 1 ? "" : "s"} failed and may need retry.`);
  }

  if (stalePending > 0) {
    needsAttention.push(`${stalePending} delivery attempt${stalePending === 1 ? " is" : "s are"} stuck in pending status for more than 3 hours.`);
  }

  if (activeConnections === 0) {
    needsAttention.push("No active social connections are configured for publishing.");
  }

  if (tokenExpiringSoon > 0) {
    needsAttention.push(`${tokenExpiringSoon} social connection token${tokenExpiringSoon === 1 ? "" : "s"} expires within 72 hours.`);
  }

  if (publishJobsFailed > 0) {
    needsAttention.push(`${publishJobsFailed} publish job${publishJobsFailed === 1 ? " has" : "s have"} failed.`);
  }

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
          enabledEventTypes: integration.enabled_event_types ?? [],
        }
      : {
          enabled: false,
          shopreelBaseUrl: getShopReelBaseUrl(),
          remoteShopId: null,
          lastTestedAt: null,
          lastSuccessAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          enabledEventTypes: [],
        },
    kpis: {
      attempts,
      successCount,
      failedCount,
      pendingCount,
      successRatePct,
      stalePending,
    },
    sourceHealth: deliveryByEventType,
    pipeline: {
      publicationsQueued,
      publicationsScheduled,
      publicationsPublishing,
      publicationsPublished,
      publicationsFailed,
      publishJobsQueued,
      publishJobsRunning,
      publishJobsFailed,
      manualAssetsTotal: typedManualAssets.length,
      manualAssetsDraft: draftManualAssets,
      activeConnections,
      tokenExpiringSoon,
    },
    needsAttention,
    deliveries:
      typedDeliveries.map((delivery) => ({
        id: delivery.id,
        eventKey: delivery.event_key,
        eventType: delivery.event_type,
        status: toDeliveryStatus(delivery.status),
        httpStatus: delivery.http_status,
        deliveredAt: delivery.delivered_at,
        errorMessage: delivery.error_message,
        createdAt: delivery.created_at,
      })) ?? [],
  } as const;
}
