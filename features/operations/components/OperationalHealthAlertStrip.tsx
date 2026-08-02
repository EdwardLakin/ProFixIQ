"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type HealthPayload = {
  operational: {
    installed: boolean;
    pipeline: {
      status: "healthy" | "needs_attention" | "stalled" | "idle" | "not_installed";
      eventsLast24h: number;
      eventsPrevious24h: number;
      recentBusinessWrites: number;
      unresolvedFailures: number;
      lastEventAt: string | null;
    };
  };
  ai: {
    health: {
      cronProbablyRunning: boolean | "unknown";
      hasStaleBacklog: boolean;
      hasPendingApprovalBacklog: boolean;
    };
  };
};

type HealthIssue = {
  key: string;
  label: string;
  detail: string;
  critical: boolean;
};

function deriveIssues(payload: HealthPayload): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const pipeline = payload.operational.pipeline;
  const volumeDropped =
    payload.operational.installed &&
    pipeline.recentBusinessWrites > 0 &&
    pipeline.eventsPrevious24h >= 20 &&
    pipeline.eventsLast24h <= Math.floor(pipeline.eventsPrevious24h * 0.25);

  if (pipeline.status === "stalled") {
    issues.push({
      key: "stalled",
      label: "Event pipeline stalled",
      detail: `${pipeline.recentBusinessWrites} recent work-order writes were found without recent canonical event activity.`,
      critical: true,
    });
  }

  if (pipeline.unresolvedFailures > 0) {
    issues.push({
      key: "failures",
      label: "Event capture failures",
      detail: `${pipeline.unresolvedFailures} unresolved capture failure${pipeline.unresolvedFailures === 1 ? "" : "s"}; business actions were preserved.`,
      critical: true,
    });
  }

  if (volumeDropped) {
    issues.push({
      key: "volume",
      label: "Event volume dropped",
      detail: `Event volume fell from ${pipeline.eventsPrevious24h} to ${pipeline.eventsLast24h} while shop records continued changing.`,
      critical: false,
    });
  }

  if (payload.ai.health.cronProbablyRunning === false) {
    issues.push({
      key: "ai-expiration",
      label: "AI expiration processing",
      detail: "Stale AI work exists without recent expiration activity.",
      critical: false,
    });
  }

  return issues;
}

export default function OperationalHealthAlertStrip() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard/operational-observability?limit=1", {
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setPayload(null);
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as HealthPayload;
      setPayload(body);
    } catch {
      // The main dashboard remains available when health telemetry is unavailable.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const issues = useMemo(() => (payload ? deriveIssues(payload) : []), [payload]);
  if (!issues.length) return null;

  const critical = issues.some((issue) => issue.critical);

  return (
    <section
      className={`rounded-2xl border px-4 py-3 ${
        critical
          ? "border-red-500/35 bg-red-500/10"
          : "border-amber-500/35 bg-amber-500/10"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              critical
                ? "bg-red-500/15 text-red-700 dark:text-red-200"
                : "bg-amber-500/15 text-amber-800 dark:text-amber-100"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              Operational health
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {issues.map((issue) => (
                <span
                  key={issue.key}
                  title={issue.detail}
                  className="rounded-full border border-current/20 bg-white/35 px-2.5 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)] dark:bg-black/10"
                >
                  {issue.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
              {issues[0]?.detail}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh operational health"
            className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/operations/observability"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm font-semibold text-[color:var(--theme-text-primary)]"
          >
            Review health <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
