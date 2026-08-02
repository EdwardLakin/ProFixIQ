import "server-only";

type MonitorClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
  from: (table: string) => any;
};

export type OperationalHealthStatus =
  | "healthy"
  | "needs_attention"
  | "stalled"
  | "volume_drop"
  | "idle";

export type OperationalHealthRow = {
  shop_id: string;
  recent_business_writes: number;
  events_last_6h: number;
  events_last_24h: number;
  events_previous_24h: number;
  last_event_at: string | null;
  unresolved_failure_count: number;
  health_status: OperationalHealthStatus;
};

type NotificationSpec = {
  code: "operational_event_pipeline_stalled" | "operational_event_volume_drop";
  level: "warning" | "critical";
  title: string;
  message: string;
};

const MONITOR_SOURCE = "observability_monitor";
const MONITOR_CODES = [
  "operational_event_pipeline_stalled",
  "operational_event_volume_drop",
] as const;

function relationMissing(error: { code?: string; message?: string } | null): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    message.includes("get_operational_observability_health")
  );
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRow(value: unknown): OperationalHealthRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const shopId = typeof row.shop_id === "string" ? row.shop_id : "";
  const status = String(row.health_status ?? "") as OperationalHealthStatus;
  if (!shopId || !["healthy", "needs_attention", "stalled", "volume_drop", "idle"].includes(status)) {
    return null;
  }

  return {
    shop_id: shopId,
    recent_business_writes: count(row.recent_business_writes),
    events_last_6h: count(row.events_last_6h),
    events_last_24h: count(row.events_last_24h),
    events_previous_24h: count(row.events_previous_24h),
    last_event_at: typeof row.last_event_at === "string" ? row.last_event_at : null,
    unresolved_failure_count: count(row.unresolved_failure_count),
    health_status: status,
  };
}

export function getOperationalHealthNotification(
  row: OperationalHealthRow,
): NotificationSpec | null {
  if (row.health_status === "stalled") {
    return {
      code: "operational_event_pipeline_stalled",
      level: "critical",
      title: "Operational event pipeline may be stalled",
      message: `${row.recent_business_writes} recent work-order or job-line write${
        row.recent_business_writes === 1 ? "" : "s"
      } occurred without matching recent operational events.`,
    };
  }

  if (row.health_status === "volume_drop") {
    return {
      code: "operational_event_volume_drop",
      level: "warning",
      title: "Operational event volume dropped sharply",
      message: `The event stream recorded ${row.events_last_24h} event${
        row.events_last_24h === 1 ? "" : "s"
      } in the last 24 hours, compared with ${row.events_previous_24h} in the previous 24-hour window.`,
    };
  }

  return null;
}

export async function monitorOperationalObservability(input: {
  supabase: MonitorClient;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { data, error } = await input.supabase.rpc(
    "get_operational_observability_health",
    { p_now: nowIso },
  );

  if (error) {
    if (relationMissing(error)) {
      return {
        installed: false,
        generatedAt: nowIso,
        shopsChecked: 0,
        activeAlerts: 0,
        resolvedAlerts: 0,
        statuses: {},
      };
    }
    throw new Error(error.message ?? "Unable to evaluate operational observability health");
  }

  const rows = (Array.isArray(data) ? data : [])
    .map(normalizeRow)
    .filter((row): row is OperationalHealthRow => row !== null);

  const { data: existingData, error: existingError } = await input.supabase
    .from("assistant_notifications")
    .select("id, shop_id, code, status, first_seen_at")
    .eq("source", MONITOR_SOURCE)
    .in("code", [...MONITOR_CODES]);

  if (existingError) throw new Error(existingError.message);

  const existingRows = (existingData ?? []) as Array<{
    id: string;
    shop_id: string;
    code: string;
    status: string;
    first_seen_at: string;
  }>;
  const existingByKey = new Map(
    existingRows.map((row) => [`${row.shop_id}:${row.code}`, row] as const),
  );

  const activeKeys = new Set<string>();
  const upserts: Array<Record<string, unknown>> = [];
  const statusCounts: Record<string, number> = {};

  for (const row of rows) {
    statusCounts[row.health_status] = (statusCounts[row.health_status] ?? 0) + 1;
    const spec = getOperationalHealthNotification(row);
    if (!spec) continue;

    const key = `${row.shop_id}:${spec.code}`;
    activeKeys.add(key);
    const existing = existingByKey.get(key);

    upserts.push({
      shop_id: row.shop_id,
      user_id: null,
      role: "owner",
      source: MONITOR_SOURCE,
      fingerprint: `observability-monitor::${spec.code}`,
      code: spec.code,
      level: spec.level,
      title: spec.title,
      message: spec.message,
      href: "/dashboard/operations/observability",
      entity_type: "shop",
      entity_id: row.shop_id,
      status: existing?.status === "acknowledged" ? "acknowledged" : "active",
      metadata: {
        health_status: row.health_status,
        recent_business_writes: row.recent_business_writes,
        events_last_6h: row.events_last_6h,
        events_last_24h: row.events_last_24h,
        events_previous_24h: row.events_previous_24h,
        last_event_at: row.last_event_at,
        unresolved_failure_count: row.unresolved_failure_count,
      },
      first_seen_at: existing?.first_seen_at ?? nowIso,
      last_seen_at: nowIso,
      resolved_at: null,
      updated_at: nowIso,
    });
  }

  if (upserts.length > 0) {
    const { error: upsertError } = await input.supabase
      .from("assistant_notifications")
      .upsert(upserts, { onConflict: "shop_id,fingerprint" });
    if (upsertError) throw new Error(upsertError.message);
  }

  const resolutionIds = existingRows
    .filter(
      (row) =>
        row.status !== "resolved" &&
        !activeKeys.has(`${row.shop_id}:${row.code}`),
    )
    .map((row) => row.id);

  if (resolutionIds.length > 0) {
    const { error: resolveError } = await input.supabase
      .from("assistant_notifications")
      .update({ status: "resolved", resolved_at: nowIso, updated_at: nowIso })
      .in("id", resolutionIds);
    if (resolveError) throw new Error(resolveError.message);
  }

  return {
    installed: true,
    generatedAt: nowIso,
    shopsChecked: rows.length,
    activeAlerts: upserts.length,
    resolvedAlerts: resolutionIds.length,
    statuses: statusCounts,
  };
}
