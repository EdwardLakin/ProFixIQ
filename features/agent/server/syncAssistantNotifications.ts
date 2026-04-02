import { getServerSupabase } from "./supabase";
import { getOpsNotifications } from "./getOpsNotifications";

export type PersistedAssistantNotification = {
  id: string;
  shop_id: string;
  user_id: string | null;
  role: string | null;
  source: string;
  fingerprint: string;
  code: string;
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: "active" | "acknowledged" | "resolved";
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function buildFingerprint(item: {
  code: string;
  entityType?: string;
  entityId?: string;
  href?: string;
  title: string;
}): string {
  return [
    item.code,
    item.entityType ?? "na",
    item.entityId ?? "na",
    item.href ?? "na",
    item.title.trim().toLowerCase(),
  ].join("::");
}

export async function syncAssistantNotifications(params: {
  shopId: string;
  userId?: string | null;
  role?: string | null;
}): Promise<PersistedAssistantNotification[]> {
  const { shopId, userId = null, role = null } = params;
  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  const computed = await getOpsNotifications(shopId);

  const fingerprints = computed.map((item) =>
    buildFingerprint({
      code: item.code,
      entityType: item.entityType,
      entityId: item.entityId,
      href: item.href,
      title: item.title,
    }),
  );

  const { data: existingRows, error: existingError } = await supabase
    .from("assistant_notifications")
    .select("id, fingerprint, first_seen_at, status")
    .eq("shop_id", shopId)
    .eq("source", "ops");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingByFingerprint = new Map<
    string,
    { id: string; first_seen_at: string; status: string }
  >();

  for (const row of existingRows ?? []) {
    existingByFingerprint.set(row.fingerprint, {
      id: row.id,
      first_seen_at: row.first_seen_at,
      status: row.status,
    });
  }

  const upsertRows = computed.map((item) => {
    const fingerprint = buildFingerprint({
      code: item.code,
      entityType: item.entityType,
      entityId: item.entityId,
      href: item.href,
      title: item.title,
    });

    const existing = existingByFingerprint.get(fingerprint);

    return {
      shop_id: shopId,
      user_id: userId,
      role,
      source: "ops",
      fingerprint,
      code: item.code,
      level: item.level === "urgent" ? "critical" : item.level,
      title: item.title,
      message: item.message,
      href: item.href ?? null,
      entity_type: item.entityType ?? null,
      entity_id: item.entityId ?? null,
      status:
        existing?.status === "acknowledged"
          ? "acknowledged"
          : "open",
      metadata: {},
      first_seen_at: existing?.first_seen_at ?? now,
      last_seen_at: now,
      resolved_at: null,
      updated_at: now,
    };
  });

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("assistant_notifications")
      .upsert(upsertRows, {
        onConflict: "shop_id,fingerprint",
      });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  const activeFingerprints = new Set(fingerprints);

  const toResolve = (existingRows ?? [])
    .filter((row) => row.status !== "resolved")
    .filter((row) => !activeFingerprints.has(row.fingerprint))
    .map((row) => row.id);

  if (toResolve.length > 0) {
    const { error: resolveError } = await supabase
      .from("assistant_notifications")
      .update({
        status: "resolved",
        resolved_at: now,
        updated_at: now,
      })
      .in("id", toResolve);

    if (resolveError) {
      throw new Error(resolveError.message);
    }
  }

  const { data: finalRows, error: finalError } = await supabase
    .from("assistant_notifications")
    .select("*")
    .eq("shop_id", shopId)
    .eq("source", "ops")
    .in("status", ["open", "acknowledged"])
    .order("last_seen_at", { ascending: false });

  if (finalError) {
    throw new Error(finalError.message);
  }

  return (finalRows ?? []) as PersistedAssistantNotification[];
}
