import "server-only";

import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_EVENT_LIMIT = 160;
const MAX_EVENT_LIMIT = 300;
const PIPELINE_STALL_HOURS = 6;

export const OPERATIONAL_DOMAIN_ORDER = [
  "work_orders",
  "inspections",
  "estimates",
  "parts",
  "workforce",
  "invoicing",
  "scheduling",
  "fleet",
  "portal",
  "messaging",
  "ai",
  "other",
] as const;

export type OperationalDomain = (typeof OPERATIONAL_DOMAIN_ORDER)[number];
export type OperationalPipelineStatus =
  | "healthy"
  | "needs_attention"
  | "stalled"
  | "idle"
  | "not_installed";

type OperationalServerClient = SupabaseClient<Database>;

function fromTable(client: OperationalServerClient, table: string) {
  return client.from(table as never);
}

type OperationalEventRow = {
  id: string;
  shop_id: string;
  event_type: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  parent_entity_type: string | null;
  parent_entity_id: string | null;
  correlation_id: string | null;
  source: string;
  severity: "info" | "warning" | "critical";
  metadata: Json;
};

type OperationalFailureRow = {
  id: string;
  shop_id: string | null;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  source_table: string | null;
  sqlstate: string | null;
  error_message: string;
  context: Json;
  attempt_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};

export type OperationalEventItem = OperationalEventRow & {
  domain: OperationalDomain;
  href: string | null;
};

export type OperationalObservability = {
  installed: boolean;
  generatedAt: string;
  pipeline: {
    status: OperationalPipelineStatus;
    lastEventAt: string | null;
    eventsLast24h: number;
    eventsPrevious24h: number;
    eventsLast7d: number;
    recentBusinessWrites: number;
    unresolvedFailures: number;
    failuresLast24h: number;
  };
  coverage: Array<{
    domain: OperationalDomain;
    count: number;
    active: boolean;
  }>;
  eventTypes: Array<{ eventType: string; count: number }>;
  events: OperationalEventItem[];
  failures: OperationalFailureRow[];
};

export type GetOperationalObservabilityInput = {
  supabase: OperationalServerClient;
  shopId: string;
  now?: Date;
  limit?: number;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
};

function relationMissing(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  const code = String(candidate?.code ?? "");
  const message = String(candidate?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("operational_events") && message.includes("does not exist"))
  );
}

function safeCount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function limitValue(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_EVENT_LIMIT;
  return Math.max(1, Math.min(MAX_EVENT_LIMIT, Math.trunc(value ?? DEFAULT_EVENT_LIMIT)));
}

function eventPrefix(eventType: string): string {
  return String(eventType ?? "").split(".")[0] ?? "";
}

export function getOperationalDomain(eventType: string): OperationalDomain {
  const prefix = eventPrefix(eventType);
  if (prefix === "work_order" || prefix === "work_order_line") return "work_orders";
  if (prefix === "inspection" || prefix === "inspection_item") return "inspections";
  if (prefix === "estimate" || prefix === "quote_line") return "estimates";
  if (prefix === "parts") return "parts";
  if (prefix === "workforce") return "workforce";
  if (prefix === "invoice") return "invoicing";
  if (prefix === "booking") return "scheduling";
  if (prefix === "fleet") return "fleet";
  if (prefix === "portal") return "portal";
  if (prefix === "messaging") return "messaging";
  if (prefix === "ai") return "ai";
  return "other";
}

function metadataUuid(metadata: Json, key: string): string | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, Json | undefined>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getOperationalEntityHref(
  event: Pick<
    OperationalEventRow,
    "entity_type" | "entity_id" | "parent_entity_type" | "parent_entity_id" | "metadata"
  >,
): string | null {
  const workOrderId =
    (event.entity_type === "work_order" ? event.entity_id : null) ??
    (event.parent_entity_type === "work_order" ? event.parent_entity_id : null) ??
    metadataUuid(event.metadata, "work_order_id");

  if (workOrderId) return `/work-orders/${workOrderId}`;
  if (event.entity_type === "booking") return "/dashboard/bookings";
  if (event.entity_type === "purchase_order") return "/parts/purchase-orders";
  if (event.entity_type === "part_request" || event.entity_type === "part_request_item") {
    return "/parts/requests";
  }
  if (
    event.entity_type === "punch_event" ||
    event.entity_type === "payroll_time_entry" ||
    event.parent_entity_type === "profile"
  ) {
    return "/dashboard/workforce/overview";
  }
  if (event.entity_type === "conversation" || event.entity_type === "message") {
    return "/messages";
  }
  return null;
}

export function deriveOperationalPipelineStatus(input: {
  installed: boolean;
  unresolvedFailures: number;
  recentBusinessWrites: number;
  lastEventAt: string | null;
  now: Date;
}): OperationalPipelineStatus {
  if (!input.installed) return "not_installed";
  if (input.unresolvedFailures > 0) return "needs_attention";

  const lastEventMs = input.lastEventAt ? Date.parse(input.lastEventAt) : Number.NaN;
  const staleThreshold = input.now.getTime() - PIPELINE_STALL_HOURS * 60 * 60 * 1000;
  if (
    input.recentBusinessWrites > 0 &&
    (!Number.isFinite(lastEventMs) || lastEventMs < staleThreshold)
  ) {
    return "stalled";
  }
  if (input.recentBusinessWrites === 0 && !Number.isFinite(lastEventMs)) return "idle";
  return "healthy";
}

export async function getOperationalObservability(
  input: GetOperationalObservabilityInput,
): Promise<OperationalObservability> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const eventLimit = limitValue(input.limit);

  let eventsQuery = fromTable(input.supabase, "operational_events")
    .select(
      "id, shop_id, event_type, occurred_at, actor_user_id, actor_role, entity_type, entity_id, parent_entity_type, parent_entity_id, correlation_id, source, severity, metadata",
    )
    .eq("shop_id", input.shopId)
    .gte("occurred_at", since7d)
    .order("occurred_at", { ascending: false })
    .limit(eventLimit);

  if (input.entityType) eventsQuery = eventsQuery.eq("entity_type", input.entityType);
  if (input.entityId) eventsQuery = eventsQuery.eq("entity_id", input.entityId);
  if (input.correlationId) eventsQuery = eventsQuery.eq("correlation_id", input.correlationId);

  const [
    eventsResult,
    events24Result,
    eventsPrevious24Result,
    events7dResult,
    latestResult,
    failuresResult,
    unresolvedFailuresResult,
    failures24Result,
    workOrdersResult,
    workOrderLinesResult,
  ] = await Promise.all([
    eventsQuery,
    fromTable(input.supabase, "operational_events")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .gte("occurred_at", since24h),
    fromTable(input.supabase, "operational_events")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .gte("occurred_at", since48h)
      .lt("occurred_at", since24h),
    fromTable(input.supabase, "operational_events")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .gte("occurred_at", since7d),
    fromTable(input.supabase, "operational_events")
      .select("occurred_at")
      .eq("shop_id", input.shopId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fromTable(input.supabase, "operational_event_failures")
      .select(
        "id, shop_id, event_type, entity_type, entity_id, source_table, sqlstate, error_message, context, attempt_count, first_seen_at, last_seen_at, resolved_at",
      )
      .eq("shop_id", input.shopId)
      .order("last_seen_at", { ascending: false })
      .limit(40),
    fromTable(input.supabase, "operational_event_failures")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .is("resolved_at", null),
    fromTable(input.supabase, "operational_event_failures")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .gte("last_seen_at", since24h),
    fromTable(input.supabase, "work_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .gte("updated_at", since24h),
    fromTable(input.supabase, "work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .gte("updated_at", since24h),
  ]);

  if (eventsResult.error && relationMissing(eventsResult.error)) {
    return {
      installed: false,
      generatedAt,
      pipeline: {
        status: "not_installed",
        lastEventAt: null,
        eventsLast24h: 0,
        eventsPrevious24h: 0,
        eventsLast7d: 0,
        recentBusinessWrites: safeCount(workOrdersResult.count) + safeCount(workOrderLinesResult.count),
        unresolvedFailures: 0,
        failuresLast24h: 0,
      },
      coverage: OPERATIONAL_DOMAIN_ORDER.map((domain) => ({
        domain,
        count: 0,
        active: false,
      })),
      eventTypes: [],
      events: [],
      failures: [],
    };
  }

  const firstError = [
    eventsResult.error,
    events24Result.error,
    eventsPrevious24Result.error,
    events7dResult.error,
    latestResult.error,
    failuresResult.error,
    unresolvedFailuresResult.error,
    failures24Result.error,
    workOrdersResult.error,
    workOrderLinesResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(String((firstError as { message?: string }).message ?? firstError));
  }

  const eventRows = (eventsResult.data ?? []) as OperationalEventRow[];
  const failureRows = (failuresResult.data ?? []) as OperationalFailureRow[];
  const domainCounts = new Map<OperationalDomain, number>();
  const eventTypeCounts = new Map<string, number>();

  for (const row of eventRows) {
    const domain = getOperationalDomain(row.event_type);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    eventTypeCounts.set(row.event_type, (eventTypeCounts.get(row.event_type) ?? 0) + 1);
  }

  const recentBusinessWrites =
    safeCount(workOrdersResult.count) + safeCount(workOrderLinesResult.count);
  const unresolvedFailures = safeCount(unresolvedFailuresResult.count);
  const lastEventAt =
    (latestResult.data as { occurred_at?: string } | null)?.occurred_at ?? null;

  return {
    installed: true,
    generatedAt,
    pipeline: {
      status: deriveOperationalPipelineStatus({
        installed: true,
        unresolvedFailures,
        recentBusinessWrites,
        lastEventAt,
        now,
      }),
      lastEventAt,
      eventsLast24h: safeCount(events24Result.count),
      eventsPrevious24h: safeCount(eventsPrevious24Result.count),
      eventsLast7d: safeCount(events7dResult.count),
      recentBusinessWrites,
      unresolvedFailures,
      failuresLast24h: safeCount(failures24Result.count),
    },
    coverage: OPERATIONAL_DOMAIN_ORDER.map((domain) => {
      const count = domainCounts.get(domain) ?? 0;
      return { domain, count, active: count > 0 };
    }),
    eventTypes: Array.from(eventTypeCounts.entries())
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType))
      .slice(0, 18),
    events: eventRows.map((row) => ({
      ...row,
      domain: getOperationalDomain(row.event_type),
      href: getOperationalEntityHref(row),
    })),
    failures: failureRows,
  };
}
