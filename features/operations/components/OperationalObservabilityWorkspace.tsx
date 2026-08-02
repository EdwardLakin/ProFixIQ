"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PipelineStatus =
  | "healthy"
  | "needs_attention"
  | "stalled"
  | "idle"
  | "not_installed";

type Domain =
  | "work_orders"
  | "inspections"
  | "estimates"
  | "parts"
  | "workforce"
  | "invoicing"
  | "scheduling"
  | "fleet"
  | "portal"
  | "messaging"
  | "ai"
  | "other";

type EventItem = {
  id: string;
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
  domain: Domain;
  href: string | null;
};

type FailureItem = {
  id: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  source_table: string | null;
  sqlstate: string | null;
  error_message: string;
  attempt_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};

type Payload = {
  operational: {
    installed: boolean;
    generatedAt: string;
    pipeline: {
      status: PipelineStatus;
      lastEventAt: string | null;
      eventsLast24h: number;
      eventsPrevious24h: number;
      eventsLast7d: number;
      recentBusinessWrites: number;
      unresolvedFailures: number;
      failuresLast24h: number;
    };
    coverage: Array<{ domain: Domain; count: number; active: boolean }>;
    eventTypes: Array<{ eventType: string; count: number }>;
    events: EventItem[];
    failures: FailureItem[];
  };
  ai: {
    recommendations: {
      totalActive: number;
      stale: number;
      highOrCriticalRisk: number;
      needsRefresh: number;
      byDomain: Record<string, number>;
      uncategorized: number;
    };
    approvals: {
      pending: number;
      approved: number;
      rejected: number;
      ownerPinRequiredCount: number;
    };
    expiration: {
      lastExpirationEventAt: string | null;
    };
    events: {
      lastEventAt: string | null;
      recentErrorLikeByType: Array<{ eventType: string; count: number }>;
    };
    health: {
      cronProbablyRunning: boolean | "unknown";
      hasStaleBacklog: boolean;
      hasHighRiskBacklog: boolean;
      hasPendingApprovalBacklog: boolean;
      hasRecentAiActivity: boolean;
    };
  };
};

const DOMAIN_LABELS: Record<Domain, string> = {
  work_orders: "Work orders",
  inspections: "Inspections",
  estimates: "Estimates",
  parts: "Parts",
  workforce: "Workforce",
  invoicing: "Invoicing",
  scheduling: "Scheduling",
  fleet: "Fleet",
  portal: "Portal",
  messaging: "Messaging",
  ai: "AI",
  other: "Other",
};

const STATUS_META: Record<
  PipelineStatus,
  { label: string; detail: string; icon: typeof CheckCircle2; tone: string }
> = {
  healthy: {
    label: "Healthy",
    detail: "Operational activity is reaching the canonical event stream.",
    icon: CheckCircle2,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  },
  needs_attention: {
    label: "Needs attention",
    detail: "Business actions were preserved, but event failures need review.",
    icon: AlertTriangle,
    tone: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-100",
  },
  stalled: {
    label: "Possible stall",
    detail: "Recent business writes exist without recent operational events.",
    icon: XCircle,
    tone: "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200",
  },
  idle: {
    label: "Idle",
    detail: "No recent shop activity is available to evaluate.",
    icon: Clock3,
    tone: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  },
  not_installed: {
    label: "Migration required",
    detail: "The operational observability migration has not been applied.",
    icon: Database,
    tone: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-200",
  },
};

function relativeTime(value: string | null): string {
  if (!value) return "No activity";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  const delta = Math.max(0, Date.now() - parsed);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function eventLabel(value: string): string {
  return value
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function entityLabel(event: EventItem): string {
  const id = event.entity_id?.slice(0, 8);
  return id ? `${event.entity_type.replaceAll("_", " ")} ${id}` : event.entity_type;
}

function severityClass(severity: EventItem["severity"]): string {
  if (severity === "critical") {
    return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200";
  }
  if (severity === "warning") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-100";
  }
  return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-200";
}

function aiCronLabel(value: boolean | "unknown"): string {
  if (value === "unknown") return "Unknown";
  return value ? "Running" : "Needs review";
}

type OperationalObservabilityFilters = {
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
};

export default function OperationalObservabilityWorkspace({
  initialFilters,
}: {
  initialFilters?: OperationalObservabilityFilters;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<Domain | "all">("all");
  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (initialFilters?.entityType) {
      params.set("entityType", initialFilters.entityType);
    }
    if (initialFilters?.entityId) {
      params.set("entityId", initialFilters.entityId);
    }
    if (initialFilters?.correlationId) {
      params.set("correlationId", initialFilters.correlationId);
    }
    return params.toString();
  }, [
    initialFilters?.correlationId,
    initialFilters?.entityId,
    initialFilters?.entityType,
  ]);
  const timelineFiltered = apiQuery.length > 0;

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/dashboard/operational-observability${apiQuery ? `?${apiQuery}` : ""}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load operational observability.");
      }
      setData(body);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load operational observability.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.operational.events ?? []).filter((event) => {
      if (domain !== "all" && event.domain !== domain) return false;
      if (!query) return true;
      return [
        event.event_type,
        event.entity_type,
        event.entity_id,
        event.actor_role,
        event.source,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, domain, search]);

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
        <h2 className="font-semibold text-red-700 dark:text-red-200">
          Observability is unavailable
        </h2>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          {error ?? "No observability payload was returned."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </section>
    );
  }

  const status = STATUS_META[data.operational.pipeline.status];
  const StatusIcon = status.icon;
  const aiErrorCount = data.ai.events.recentErrorLikeByType.reduce(
    (sum, item) => sum + item.count,
    0,
  );

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-4 ${status.tone}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-current/20 bg-white/35 dark:bg-black/15">
              <StatusIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Event pipeline
              </p>
              <h2 className="mt-0.5 text-xl font-bold">{status.label}</h2>
              <p className="mt-1 text-sm opacity-85">{status.detail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-current/25 bg-white/30 px-4 text-sm font-semibold transition hover:bg-white/45 disabled:opacity-60 dark:bg-black/10 dark:hover:bg-black/20"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={Activity}
          label="Events · 24h"
          value={data.operational.pipeline.eventsLast24h}
          detail={`${data.operational.pipeline.eventsLast7d} in 7 days · ${data.operational.pipeline.eventsPrevious24h} prior day`}
        />
        <Metric
          icon={Workflow}
          label="Business writes · 24h"
          value={data.operational.pipeline.recentBusinessWrites}
          detail="Work orders and job lines"
        />
        <Metric
          icon={AlertTriangle}
          label="Open failures"
          value={data.operational.pipeline.unresolvedFailures}
          detail={`${data.operational.pipeline.failuresLast24h} seen in 24h`}
          warn={data.operational.pipeline.unresolvedFailures > 0}
        />
        <Metric
          icon={Clock3}
          label="Last event"
          value={relativeTime(data.operational.pipeline.lastEventAt)}
          detail="Canonical stream activity"
        />
        <Metric
          icon={Sparkles}
          label="AI backlog"
          value={data.ai.recommendations.totalActive}
          detail={`${data.ai.recommendations.stale} stale`}
          warn={data.ai.recommendations.stale > 0}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <Panel
            eyebrow="Coverage"
            title="Operational domains"
            description="Recent events grouped by the workflow that produced them."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.operational.coverage.map((item) => (
                <button
                  key={item.domain}
                  type="button"
                  onClick={() =>
                    setDomain((current) =>
                      current === item.domain ? "all" : item.domain,
                    )
                  }
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    domain === item.domain
                      ? "border-blue-500/45 bg-blue-500/10"
                      : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] hover:border-blue-400/35"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      item.active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {DOMAIN_LABELS[item.domain]}
                    </span>
                    <span className="text-xs text-[color:var(--theme-text-muted)]">
                      {item.active ? "Reporting" : "No recent events"}
                    </span>
                  </span>
                  <strong className="text-lg text-[color:var(--theme-text-primary)]">
                    {item.count}
                  </strong>
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Timeline"
            title="Recent operational events"
            description="One chronological stream across work orders, inspections, parts, workforce, invoicing, portals and AI."
            rightSlot={
              domain !== "all" ? (
                <button
                  type="button"
                  onClick={() => setDomain("all")}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-200"
                >
                  Clear {DOMAIN_LABELS[domain]}
                </button>
              ) : null
            }
          >
            {timelineFiltered ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-800 dark:text-blue-100">
                <span>This timeline is filtered to the selected operational record.</span>
                <Link
                  href="/dashboard/operations/observability"
                  className="font-semibold underline underline-offset-2"
                >
                  Clear record filter
                </Link>
              </div>
            ) : null}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search event, entity, role or source"
                  className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] pl-10 pr-3 text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-blue-500/50"
                />
              </label>
              <select
                value={domain}
                onChange={(event) => setDomain(event.target.value as Domain | "all")}
                className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)]"
              >
                <option value="all">All domains</option>
                {data.operational.coverage.map((item) => (
                  <option key={item.domain} value={item.domain}>
                    {DOMAIN_LABELS[item.domain]} ({item.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-[color:var(--theme-border-soft)] overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)]">
              {filteredEvents.length ? (
                filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="grid gap-2 bg-[color:var(--theme-surface-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${severityClass(event.severity)}`}
                        >
                          {event.severity}
                        </span>
                        <span className="text-xs font-medium text-[color:var(--theme-text-muted)]">
                          {DOMAIN_LABELS[event.domain]}
                        </span>
                        <span className="text-xs text-[color:var(--theme-text-muted)]">
                          {relativeTime(event.occurred_at)}
                        </span>
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {eventLabel(event.event_type)}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-[color:var(--theme-text-secondary)]">
                        {entityLabel(event)}
                        {event.actor_role ? ` · ${event.actor_role.replaceAll("_", " ")}` : ""}
                        {event.source ? ` · ${event.source.replace("database_trigger:", "")}` : ""}
                      </p>
                    </div>
                    {event.href ? (
                      <Link
                        href={event.href}
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-inset)]"
                      >
                        Open record <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
                  No operational events match the current filters.
                </div>
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel
            eyebrow="Failure sink"
            title="Event-write failures"
            description="These never block the technician or advisor action that produced them."
          >
            {data.operational.failures.length ? (
              <div className="space-y-2">
                {data.operational.failures.slice(0, 8).map((failure) => (
                  <div
                    key={failure.id}
                    className={`rounded-xl border p-3 ${
                      failure.resolved_at
                        ? "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
                        : "border-red-500/30 bg-red-500/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                        {failure.source_table ?? "Unknown source"}
                      </span>
                      <span className="text-xs text-[color:var(--theme-text-muted)]">
                        {failure.resolved_at
                          ? "Resolved"
                          : `${failure.attempt_count} attempt${failure.attempt_count === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-[color:var(--theme-text-primary)]">
                      {failure.error_message}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      {failure.event_type ?? "Event type unresolved"} · {relativeTime(failure.last_seen_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="No event failures"
                detail="The durable failure sink is clear."
              />
            )}
          </Panel>

          <Panel
            eyebrow="AI operations"
            title="Review-layer health"
            description="Recommendation freshness, approval gates and expiration telemetry."
          >
            <div className="grid grid-cols-2 gap-2">
              <CompactMetric label="Active" value={data.ai.recommendations.totalActive} />
              <CompactMetric label="Stale" value={data.ai.recommendations.stale} />
              <CompactMetric label="High risk" value={data.ai.recommendations.highOrCriticalRisk} />
              <CompactMetric label="Approvals" value={data.ai.approvals.pending} />
              <CompactMetric
                label="Cron"
                value={aiCronLabel(data.ai.health.cronProbablyRunning)}
              />
              <CompactMetric label="Recent errors" value={aiErrorCount} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard/ai-recommendations"
                className="inline-flex min-h-9 items-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-700 dark:text-blue-200"
              >
                Recommendations
              </Link>
              <Link
                href="/dashboard/ai-approvals"
                className="inline-flex min-h-9 items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-800 dark:text-amber-100"
              >
                Approval inbox
              </Link>
            </div>
          </Panel>

          <Panel
            eyebrow="Event mix"
            title="Most active event types"
            description="The highest-volume transitions in the loaded seven-day window."
          >
            <div className="space-y-2">
              {data.operational.eventTypes.slice(0, 10).map((item) => (
                <div
                  key={item.eventType}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--theme-text-secondary)]">
                    {eventLabel(item.eventType)}
                  </span>
                  <strong className="text-sm text-[color:var(--theme-text-primary)]">
                    {item.count}
                  </strong>
                </div>
              ))}
              {!data.operational.eventTypes.length ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No event mix yet"
                  detail="Event types will appear after the first instrumented workflow runs."
                />
              ) : null}
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  warn = false,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        warn
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{detail}</p>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[color:var(--theme-text-primary)]">{value}</p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  rightSlot,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-200">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-[color:var(--theme-text-primary)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            {description}
          </p>
        </div>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof CheckCircle2;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-5 text-center">
      <Icon className="mx-auto h-5 w-5 text-[color:var(--theme-text-muted)]" />
      <p className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
        {title}
      </p>
      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{detail}</p>
    </div>
  );
}
