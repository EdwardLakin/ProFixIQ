
import {
  canAccessAssistantNotifications,
  canonicalizeRole,
} from "@/features/shared/lib/rbac";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";
import {
  getAssistantNotificationWriter,
  getServerSupabase,
  markAssistantNotificationTrustedWriterRollout,
} from "./supabase";
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

type AssistantNotificationQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

const LEGACY_NOTIFICATION_STATUS_ALIASES: Record<string, AssistantNotificationStatus> = {
  active: "active",
  open: "active",
  acknowledged: "acknowledged",
  resolved: "resolved",
};

const PARTS_PICK_RELEASED_STATUSES = new Set([
  "approved",
  "partially_ordered",
  "partially_consumed",
  "partially_returned",
  "fulfilled",
  "returned",
]);

const PARTS_PICK_TERMINAL_ITEM_STATUSES = new Set([
  "cancelled",
  "canceled",
  "rejected",
]);

const PARTS_PICK_REQUEST_PAGE_SIZE = 200;
const PARTS_PICK_ITEM_PAGE_SIZE = 1000;

function normalizeAssistantNotificationStatus(
  value: unknown,
): AssistantNotificationStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  return LEGACY_NOTIFICATION_STATUS_ALIASES[key] ?? "active";
}

function isMissingAssistantNotificationsError(
  error: AssistantNotificationQueryError | null,
): boolean {
  if (!error) return false;
  const signature = [error.code, error.message, error.details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    signature.includes("pgrst205") ||
    signature.includes("42p01") ||
    (signature.includes("assistant_notifications") &&
      (signature.includes("does not exist") ||
        signature.includes("could not find") ||
        signature.includes("schema cache")))
  );
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
  userIds: string[];
  computed: OpsNotification[];
}): Promise<OpsNotification[]> {
  const supabase = getServerSupabase();
  const userIds = Array.from(
    new Set(params.userIds.map((value) => value.trim()).filter(Boolean)),
  );
  if (userIds.length === 0) return [];

  const activeStatuses = ["awaiting", "awaiting_approval", "queued", "in_progress", "on_hold"];

  const [
    { data: primaryAssignments, error: primaryError },
    { data: legacyCandidates, error: legacyError },
    { data: supportingAssignments, error: supportingError },
    { data: activeSegments, error: segmentError },
  ] =
    await Promise.all([
      supabase
        .from("work_order_lines")
        .select("id")
        .eq("shop_id", params.shopId)
        .in("assigned_tech_id", userIds)
        .in("status", activeStatuses)
        .limit(200),
      supabase
        .from("work_order_lines")
        .select("id")
        .eq("shop_id", params.shopId)
        .in("assigned_to", userIds)
        .in("status", activeStatuses)
        .limit(200),
      supabase
        .from("work_order_line_technicians")
        .select("work_order_line_id")
        .in("technician_id", userIds)
        .limit(200),
      supabase
        .from("work_order_line_labor_segments")
        .select("work_order_line_id")
        .eq("shop_id", params.shopId)
        .in("technician_id", userIds)
        .is("ended_at", null)
        .limit(50),
    ]);

  if (primaryError) throw new Error(primaryError.message);
  if (legacyError) throw new Error(legacyError.message);
  if (supportingError) throw new Error(supportingError.message);
  if (segmentError) throw new Error(segmentError.message);

  const lineIds = new Set<string>();
  const workOrderIds = new Set<string>();
  const activeLaborLineIds = new Set(
    (activeSegments ?? [])
      .map((row) => row.work_order_line_id)
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
  );
  const candidateLineIds = [
    ...(primaryAssignments ?? []).map((row) => row.id),
    ...(legacyCandidates ?? []).map((row) => row.id),
    ...(supportingAssignments ?? []).map((row) => row.work_order_line_id),
    ...(activeSegments ?? []).map((row) => row.work_order_line_id),
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0,
    );

  if (candidateLineIds.length > 0) {
    const uniqueCandidateLineIds = [...new Set(candidateLineIds)];
    const [
      { data: activeLineRows, error: activeLineError },
      { data: canonicalAssignments, error: canonicalError },
    ] = await Promise.all([
      supabase
        .from("work_order_lines")
        .select("id, work_order_id, assigned_tech_id, assigned_to")
        .eq("shop_id", params.shopId)
        .in("id", uniqueCandidateLineIds)
        .in("status", activeStatuses),
      supabase
        .from("work_order_line_technicians")
        .select("work_order_line_id, technician_id")
        .in("work_order_line_id", uniqueCandidateLineIds),
    ]);

    if (activeLineError) throw new Error(activeLineError.message);
    if (canonicalError) throw new Error(canonicalError.message);

    const technicianIdsByLine = new Map<string, string[]>();
    for (const assignment of canonicalAssignments ?? []) {
      technicianIdsByLine.set(assignment.work_order_line_id, [
        ...(technicianIdsByLine.get(assignment.work_order_line_id) ?? []),
        assignment.technician_id,
      ]);
    }

    for (const row of activeLineRows ?? []) {
      const assignment = resolveTechnicianAssignmentContract({
        primaryTechnicianId: row.assigned_tech_id,
        legacyAssignedTo: row.assigned_to,
        canonicalTechnicianIds: technicianIdsByLine.get(row.id),
      });
      const isAssigned = userIds.some((userId) =>
        assignment.technicianIds.includes(userId),
      );
      if (!isAssigned && !activeLaborLineIds.has(row.id)) continue;
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

async function getDurablePartsPickNotifications(params: {
  shopId: string;
}): Promise<PersistedAssistantNotification[]> {
  const supabase = getServerSupabase();
  const notifications: PersistedAssistantNotification[] = [];

  for (
    let requestOffset = 0;
    ;
    requestOffset += PARTS_PICK_REQUEST_PAGE_SIZE
  ) {
    const { data: requests, error: requestError } = await supabase
      .from("part_requests")
      .select(
        "id, shop_id, work_order_id, job_id, status, pick_requested_at, pick_request_source",
      )
      .eq("shop_id", params.shopId)
      .not("pick_requested_at", "is", null)
      .in("status", Array.from(PARTS_PICK_RELEASED_STATUSES))
      .order("pick_requested_at", { ascending: false })
      .order("id", { ascending: true })
      .range(
        requestOffset,
        requestOffset + PARTS_PICK_REQUEST_PAGE_SIZE - 1,
      );

    if (requestError) throw new Error(requestError.message);

    const requestPage = requests ?? [];
    if (requestPage.length === 0) break;

    const requestIds = requestPage.map((request) => request.id);
    const totals = new Map<string, { required: number; remaining: number }>();

    for (
      let itemOffset = 0;
      ;
      itemOffset += PARTS_PICK_ITEM_PAGE_SIZE
    ) {
      const { data: items, error: itemError } = await supabase
        .from("part_request_items")
        .select(
          "id, request_id, status, qty, qty_requested, qty_approved, qty_reserved, qty_consumed, qty_returned",
        )
        .eq("shop_id", params.shopId)
        .in("request_id", requestIds)
        .order("id", { ascending: true })
        .range(itemOffset, itemOffset + PARTS_PICK_ITEM_PAGE_SIZE - 1);

      if (itemError) throw new Error(itemError.message);

      const itemPage = items ?? [];
      for (const item of itemPage) {
        const requestId = item.request_id;
        if (!requestId) continue;

        const itemStatus = String(item.status ?? "")
          .trim()
          .toLowerCase();
        if (PARTS_PICK_TERMINAL_ITEM_STATUSES.has(itemStatus)) continue;

        const required = Math.max(
          Number(item.qty_approved ?? 0),
          Number(item.qty_requested ?? 0),
          Number(item.qty ?? 0),
          0,
        );
        const staged =
          Number(item.qty_reserved ?? 0) +
          Math.max(
            Number(item.qty_consumed ?? 0) - Number(item.qty_returned ?? 0),
            0,
          );
        const remaining = Math.max(required - staged, 0);
        const current = totals.get(requestId) ?? { required: 0, remaining: 0 };
        current.required += required;
        current.remaining += remaining;
        totals.set(requestId, current);
      }

      if (itemPage.length < PARTS_PICK_ITEM_PAGE_SIZE) break;
    }

    for (const request of requestPage) {
      const requestedAt = request.pick_requested_at;
      if (!requestedAt || !request.work_order_id || !request.job_id) continue;

      const requestTotals = totals.get(request.id) ?? {
        required: 0,
        remaining: 0,
      };
      if (requestTotals.required <= 0 || requestTotals.remaining <= 0) continue;

      const staged = Math.max(
        requestTotals.required - requestTotals.remaining,
        0,
      );
      const source =
        String(request.pick_request_source ?? "")
          .trim()
          .toLowerCase() === "job_start"
          ? "job_start"
          : "manual";

      notifications.push({
        id: `parts-pick:${request.id}`,
        shop_id: request.shop_id,
        user_id: null,
        role: "parts",
        source: "parts_pick_workflow",
        fingerprint: `parts-pick-request::${request.id}`,
        code: "parts_pick_requested",
        level: "warning",
        title: "Parts pick requested",
        message: `${requestTotals.remaining} approved part quantity remains to be picked/staged now.`,
        href: `/parts/requests/${request.id}`,
        entity_type: "part_request",
        entity_id: request.id,
        status: "active",
        metadata: {
          workOrderId: request.work_order_id,
          workOrderLineId: request.job_id,
          requestId: request.id,
          source,
          requiredQty: requestTotals.required,
          stagedQty: staged,
          remainingQty: requestTotals.remaining,
          durableSignal: true,
        },
        first_seen_at: requestedAt,
        last_seen_at: requestedAt,
        acknowledged_at: null,
        acknowledged_by: null,
        resolved_at: null,
        created_at: requestedAt,
        updated_at: requestedAt,
      });
    }

    if (requestPage.length < PARTS_PICK_REQUEST_PAGE_SIZE) break;
  }

  return notifications;
}

export async function syncAssistantNotifications(params: {
  shopId: string;
  userId?: string | null;
  assignmentUserIds?: string[];
  role?: string | null;
}): Promise<PersistedAssistantNotification[]> {
  const {
    shopId,
    userId = null,
    assignmentUserIds = userId ? [userId] : [],
    role = null,
  } = params;
  if (!canAccessAssistantNotifications(role)) {
    throw new Error("A shop workforce role is required for notifications");
  }

  const supabase = getServerSupabase();
  const notificationWriter = getAssistantNotificationWriter();
  await markAssistantNotificationTrustedWriterRollout(notificationWriter);
  const now = new Date().toISOString();

  const userScoped = !!userId && isUserScopedRole(role);
  const source = userScoped ? "ops_user" : "ops";
  const scopeKey = userScoped ? `user:${userId}` : "shop";
  const canonicalRole = canonicalizeRole(role);
  const canSeePartsWorkflow = ["owner", "admin", "manager", "parts"].includes(canonicalRole);
  const canSeePartsPickWorkflow = ["owner", "admin", "manager", "parts"].includes(
    canonicalRole,
  );
  const visibleSources = Array.from(
    new Set([
      source,
      ...(canSeePartsWorkflow ? ["parts_workflow"] : []),
      ...(canSeePartsPickWorkflow ? ["parts_pick_workflow"] : []),
      ...(userScoped ? ["parts_tech_workflow"] : []),
    ]),
  );

  const durablePartsPickNotifications = canSeePartsPickWorkflow
    ? await getDurablePartsPickNotifications({ shopId })
    : [];

  let computed = await getOpsNotifications(shopId);

  if (userScoped && userId) {
    computed = await filterComputedNotificationsForUser({
      shopId,
      userIds: assignmentUserIds,
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
    .select("id, fingerprint, first_seen_at, status, acknowledged_at, acknowledged_by")
    .eq("shop_id", shopId)
    .eq("source", source);

  if (userScoped) {
    existingQuery = existingQuery.eq("user_id", userId);
  }

  const { data: existingRowsData, error: existingError } = await existingQuery;
  const assistantNotificationsAvailable = !existingError;
  if (existingError && !isMissingAssistantNotificationsError(existingError)) {
    throw new Error(existingError.message);
  }
  const existingRows = assistantNotificationsAvailable
    ? (existingRowsData ?? [])
    : [];

  const existingByFingerprint = new Map<
    string,
    {
      id: string;
      first_seen_at: string;
      status: AssistantNotificationStatus;
      acknowledged_at: string | null;
      acknowledged_by: string | null;
    }
  >();

  for (const row of existingRows) {
    existingByFingerprint.set(row.fingerprint, {
      id: row.id,
      first_seen_at: row.first_seen_at,
      status: normalizeAssistantNotificationStatus(row.status),
      acknowledged_at: row.acknowledged_at ?? null,
      acknowledged_by: row.acknowledged_by ?? null,
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
      acknowledged_at:
        existing?.status === "acknowledged"
          ? existing.acknowledged_at
          : null,
      acknowledged_by:
        existing?.status === "acknowledged"
          ? existing.acknowledged_by
          : null,
      resolved_at: null,
      updated_at: now,
    };
  });

  if (assistantNotificationsAvailable && upsertRows.length > 0) {
    const { error: upsertError } = await notificationWriter
      .from("assistant_notifications")
      .upsert(upsertRows, {
        onConflict: "shop_id,fingerprint",
      });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  const activeFingerprints = new Set(fingerprints);

  const toResolve = existingRows
    .filter((row) => row.status !== "resolved")
    .filter((row) => !activeFingerprints.has(row.fingerprint))
    .map((row) => row.id);

  if (assistantNotificationsAvailable && toResolve.length > 0) {
    let resolveQuery = notificationWriter
      .from("assistant_notifications")
      .update({
        status: "resolved",
        resolved_at: now,
        updated_at: now,
      })
      .eq("shop_id", shopId)
      .eq("source", source)
      .in("id", toResolve);

    if (userScoped) {
      resolveQuery = resolveQuery.eq("user_id", userId);
    }

    const { error: resolveError } = await resolveQuery;

    if (resolveError) {
      throw new Error(resolveError.message);
    }
  }

  let persistedRows: PersistedAssistantNotification[] = [];
  if (assistantNotificationsAvailable) {
    let finalQuery = supabase
      .from("assistant_notifications")
      .select("*")
      .eq("shop_id", shopId)
      .in("source", visibleSources)
      .in("status", ["active", "acknowledged", "open"])
      .order("last_seen_at", { ascending: false });

    if (userScoped) {
      finalQuery = finalQuery.eq("user_id", userId);
    }

    const { data: finalRows, error: finalError } = await finalQuery;

    if (finalError) {
      throw new Error(finalError.message);
    }

    persistedRows = (finalRows ?? []).map((row) => ({
      ...(row as PersistedAssistantNotification),
      status: normalizeAssistantNotificationStatus(
        (row as { status?: unknown }).status,
      ),
    }));
  }

  const merged = new Map<string, PersistedAssistantNotification>();
  for (const row of persistedRows) {
    merged.set(row.fingerprint, row);
  }

  for (const durable of durablePartsPickNotifications) {
    const persisted = merged.get(durable.fingerprint);
    if (!persisted) {
      merged.set(durable.fingerprint, durable);
      continue;
    }

    merged.set(durable.fingerprint, {
      ...durable,
      id: persisted.id,
      status:
        persisted.status === "acknowledged"
          ? "acknowledged"
          : durable.status,
      first_seen_at: persisted.first_seen_at,
      acknowledged_at: persisted.acknowledged_at,
      acknowledged_by: persisted.acknowledged_by,
      created_at: persisted.created_at,
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    b.last_seen_at.localeCompare(a.last_seen_at),
  );
}
