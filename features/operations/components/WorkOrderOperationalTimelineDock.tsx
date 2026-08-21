"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Activity, ArrowUpRight, ChevronDown, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getOperationalEventPresentation } from "@/features/operations/lib/eventPresentation";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { useWorkspaceResourceContext } from "@/features/workspace/context/WorkspaceResourceContext";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set(["owner", "admin", "manager"]);

type EventItem = {
  id: string;
  event_type: string;
  occurred_at: string;
  entity_type: string;
  entity_id: string | null;
  actor_role: string | null;
  severity: "info" | "warning" | "critical";
  href: string | null;
  metadata: unknown;
};

type TimelinePayload = {
  operational?: {
    installed: boolean;
    pipeline: {
      lastEventAt: string | null;
    };
    events: EventItem[];
  };
  error?: string;
};

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function severityDot(value: EventItem["severity"]): string {
  if (value === "critical") return "bg-red-500";
  if (value === "warning") return "bg-amber-500";
  return "bg-blue-500";
}

export default function WorkOrderOperationalTimelineDock() {
  const params = useParams();
  const routeId = String(params?.id ?? "").trim();
  const workspaceResource = useWorkspaceResourceContext();
  const workspaceWorkOrderId =
    workspaceResource?.kind === "work_order"
      ? (workspaceResource.workOrderId ?? workspaceResource.resourceId)
      : null;
  const canonicalWorkspaceWorkOrderId =
    workspaceWorkOrderId && UUID_PATTERN.test(workspaceWorkOrderId)
      ? workspaceWorkOrderId
      : null;
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [eligible, setEligible] = useState(false);
  const [routeResolvedWorkOrderId, setRouteResolvedWorkOrderId] = useState<
    string | null
  >(null);
  const workOrderId =
    canonicalWorkspaceWorkOrderId ?? routeResolvedWorkOrderId;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [installed, setInstalled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();

      const role = canonicalizeRole(profile?.role);
      if (!ALLOWED_ROLES.has(role) || cancelled) return;
      setEligible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    if (!eligible || canonicalWorkspaceWorkOrderId) {
      setRouteResolvedWorkOrderId(null);
      return () => {
        cancelled = true;
      };
    }

    if (UUID_PATTERN.test(routeId)) {
      setRouteResolvedWorkOrderId(routeId);
      return () => {
        cancelled = true;
      };
    }

    setRouteResolvedWorkOrderId(null);
    void (async () => {
      const { data: workOrder } = await supabase
        .from("work_orders")
        .select("id")
        .ilike("custom_id", routeId)
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        setRouteResolvedWorkOrderId(workOrder?.id ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canonicalWorkspaceWorkOrderId, eligible, routeId, supabase]);

  const load = useCallback(async () => {
    if (!workOrderId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/dashboard/operational-observability?correlationId=${encodeURIComponent(workOrderId)}&limit=12`,
        { cache: "no-store" },
      );

      if (response.status === 401 || response.status === 403) {
        setEligible(false);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as TimelinePayload;
      if (!response.ok) throw new Error(body.error ?? "Unable to load the work-order timeline.");

      setInstalled(body.operational?.installed !== false);
      setEvents(body.operational?.events ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the work-order timeline.",
      );
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    if (!eligible || !workOrderId) return;
    void load();
  }, [eligible, load, workOrderId]);

  useEffect(() => {
    if (!open || !eligible || !workOrderId) return;
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [eligible, load, open, workOrderId]);

  const handleToggle = () => {
    if (!open) void load();
    setOpen((value) => !value);
  };

  if (!eligible || !workOrderId) return null;

  return (
    <div className="fixed bottom-20 right-3 z-[70] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:bottom-6 md:right-6">
      {open ? (
        <section className="w-[min(440px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-blue-950 px-4 py-3 text-white">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">
                Operational timeline
              </p>
              <h2 className="mt-0.5 text-base font-bold">Work order activity</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                aria-label="Refresh operational timeline"
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/10 transition hover:bg-white/20 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close operational timeline"
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/10 transition hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="max-h-[60vh] overflow-y-auto p-3">
            {!installed ? (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-[color:var(--theme-text-secondary)]">
                The operational observability migration has not been applied yet.
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
                {error}
              </div>
            ) : events.length ? (
              <div className="space-y-2">
                {events.slice(0, 10).map((event) => {
                  const presentation = getOperationalEventPresentation(event);
                  return (
                    <div
                      key={event.id}
                      className="flex gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                    >
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${severityDot(event.severity)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            {presentation.title}
                          </p>
                          <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                            {relativeTime(event.occurred_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                          {presentation.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : loading ? (
              <div className="h-24 animate-pulse rounded-xl bg-[color:var(--theme-surface-inset)]" />
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-secondary)]">
                No operational activity has been recorded for this work order yet.
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] px-4 py-3">
            <span className="text-xs text-[color:var(--theme-text-muted)]">
              {events.length} event{events.length === 1 ? "" : "s"}
              {events[0]?.occurred_at ? ` · Latest ${relativeTime(events[0].occurred_at)}` : ""}
            </span>
            <Link
              href={`/dashboard/operations/observability?correlationId=${encodeURIComponent(workOrderId)}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 text-xs font-semibold text-blue-700 dark:text-blue-200"
            >
              Full observability <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-blue-400/35 bg-blue-950 px-4 text-sm font-semibold text-white shadow-xl transition hover:bg-blue-900"
      >
        <Activity className="h-4 w-4" /> Timeline
        {events.length > 0 ? (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{events.length}</span>
        ) : null}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
