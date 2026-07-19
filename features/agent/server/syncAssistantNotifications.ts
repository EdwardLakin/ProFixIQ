
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { getServerSupabase } from "./supabase";
import { getOpsNotifications, type OpsNotification } from "./getOpsNotifications";

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

type AssistantNotificationStatus =
  PersistedAssistantNotification["status"];

const LEGACY_NOTIFICATION_STATUS_ALIASES: Record<string, AssistantNotificationStatus> = {
  active: "active",
  open: "active",
  acknowledged: "acknowledged",
  resolved: "resolved",
};

function normalizeAssistantNotificationStatus(
  value: unknown,
): AssistantNotificationStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  return LEGACY_NOTIFICATION_STATUS_ALIASES[key] ?? "active";
}

function buildFingerprint(
  item: {
    code: string;
    entityType?: string;
    entityId?: string;
    href?: string;
  },
  scopeKey: string,
): string {
  return [
    scopeKey,
    item.code,
    item.entityType ?? "na",
    item.entityId ?? "na",
    item.href ?? "na",
  ].join("::");
}

function isUserScopedRole(role: string | null | undefined): boolean {
  const canonical = canonicalizeRole(role);
  return canonical === "mechanic";
}

async function filterComputedNotificationsForUser(params: {
  shopId: string;
  userId: string;
  computed: OpsNotification[];
}): Promise<OpsNotification[]> {
  const supabase = getServerSupabase();

  const activeStatuses = ["awaiting", "awaiting_approval", "queued", "in_progress", "on_hold"];

  const [{ data: assignedLines, error: assignedError }, { data: activeSegments, error: segmentError }] =
    await Promise.all([
      supabase
        .from("work_order_lines")
        .select("id, work_order_id")
        .eq("shop_id", params.shopId)
        .eq("assigned_tech_id", params.userId)
        .in("status", activeStatuses)
        .limit(200),
      supabase
        .from("work_order_line_labor_segments")
        .select("work_order_line_id")
        .eq("shop_id", params.shopId)
        .eq("technician_id", params.userId)
        .is("ended_at", null)
        .limit(50),
    ]);

  if (assignedError) throw new Error(assignedError.message);
  if (segmentError) throw new Error(segmentError.message);

  const lineIds = new Set<string>();
  const workOrderIds = new Set<string>();

  for (const row of assignedLines ?? []) {
    if (row.id) lineIds.add(row.id);
    if (row.work_order_id) workOrderIds.add(row.work_order_id);
  }

  const activeLineIds = (activeSegments ?? [])
    .map((row) => row.work_order_line_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (activeLineIds.length > 0) {
    const { data: activeLineRows, error: activeLineError } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id")
      .eq("shop_id", params.shopId)
      .in("id", activeLineIds);

    if (activeLineError) throw new Error(activeLineError.message);

    for (const row of activeLineRows ?? []) {
      if (row.id) lineIds.add(row.id);
      if (row.work_order_id) workOrderIds.add(row.work_order_id);
    }
  }

  return params.computed.filter((item) => {
    if (item.entityType === "work_order") {
      return !!item.entityId && workOrderIds.has(item.entityId);
    }

    if (item.entityType === "work_order_line") {
      return !!item.entityId && lineIds.has(item.entityId);
    }

    return false;
  });
}

export async function syncAssistantNotifications(params: {
  shopId: string;
  userId?: string | null;
  role?: string | null;
}): Promise<PersistedAssistantNotification[]> {
  const { shopId, userId = null, role = null } = params;
  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  const userScoped = !!userId && isUserScopedRole(role);
  const source = userScoped ? "ops_user" : "ops";
  const scopeKey = userScoped ? `user:${userId}` : "shop";
  const canonicalRole = canonicalizeRole(role);
  const canSeePartsWorkflow = ["owner", "admin", "manager", "parts"].includes(canonicalRole);

  let computed = await getOpsNotifications(shopId);

  if (userScoped && userId) {
    computed = await filterComputedNotificationsForUser({
      shopId,
      userId,
      computed,
    });
  }

  const fingerprints = computed.map((item) =>
    buildFingerprint(
      {
        code: item.code,
        entityType: item.entityType,
        entityId: item.entityId,
        href: item.href,
      },
      scopeKey,
    ),
  );

  let existingQuery = supabase
    .from("assistant_notifications")
    .select("id, fingerprint, first_seen_at, status")
    .eq("shop_id", shopId)
    .eq("source", source);

  if (userScoped) {
    existingQuery = existingQuery.eq("user_id", userId);
  }

  const { data: existingRows, error: existingError } = await existingQuery;

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingByFingerprint = new Map<
    string,
    { id: string; first_seen_at: string; status: AssistantNotificationStatus }
  >();

  for (const row of existingRows ?? []) {
    existingByFingerprint.set(row.fingerprint, {
      id: row.id,
      first_seen_at: row.first_seen_at,
      status: normalizeAssistantNotificationStatus(row.status),
    });
  }

  const upsertRows = computed.map((item) => {
    const fingerprint = buildFingerprint(
      {
        code: item.code,
        entityType: item.entityType,
        entityId: item.entityId,
        href: item.href,
      },
      scopeKey,
    );

    const existing = existingByFingerprint.get(fingerprint);

    return {
      shop_id: shopId,
      user_id: userScoped ? userId : null,
      role,
      source,
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
          : "active",
      metadata: {
        scope: userScoped ? "user" : "shop",
      },
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

  let finalQuery = supabase
    .from("assistant_notifications")
    .select("*")
    .eq("shop_id", shopId)
    .in("source", canSeePartsWorkflow ? [source, "parts_workflow"] : [source])
    .in("status", ["active", "acknowledged", "open"])
    .order("last_seen_at", { ascending: false });

  if (userScoped) {
    finalQuery = finalQuery.eq("user_id", userId);
  }

  const { data: finalRows, error: finalError } = await finalQuery;

  if (finalError) {
    throw new Error(finalError.message);
  }

  return (finalRows ?? []).map((row) => ({
    ...(row as PersistedAssistantNotification),
    status: normalizeAssistantNotificationStatus(
      (row as { status?: unknown }).status,
    ),
  }));
}
