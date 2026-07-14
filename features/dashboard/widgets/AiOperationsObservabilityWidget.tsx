"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";

type Observability = {
  generatedAt: string;
  recommendations: {
    totalActive: number;
    stale: number;
    byDomain: Record<"work_orders" | "shop_boost", number>;
  };
  approvals: {
    pending: number;
  };
  expiration: {
    lastExpirationEventAt: string | null;
    recommendationsExpiredLast24h: number;
    recommendationsExpiredLast7d: number;
  };
  events: {
    lastEventAt: string | null;
  };
  health: {
    cronProbablyRunning: boolean | "unknown";
    hasStaleBacklog: boolean;
    hasHighRiskBacklog: boolean;
    hasPendingApprovalBacklog: boolean;
  };
};

function rel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const delta = Date.now() - ms;
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function healthLabel(value: boolean | "unknown"): string {
  if (value === "unknown") return "Unknown";
  return value ? "Running" : "Needs review";
}

export default function AiOperationsObservabilityWidget() {
  const [data, setData] = useState<Observability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/ai-observability", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { observability?: Observability; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load AI observability.");
      setData(json.observability ?? null);
    } catch (e) {
      setError(toDashboardFallbackMessage(e, "AI observability is unavailable right now."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flags = useMemo(() => {
    if (!data) return [];
    const items: Array<{ label: string; active: boolean }> = [
      { label: "Stale backlog", active: data.health.hasStaleBacklog },
      { label: "High-risk backlog", active: data.health.hasHighRiskBacklog },
      { label: "Pending approvals", active: data.health.hasPendingApprovalBacklog },
    ];
    return items;
  }, [data]);

  return (
    <DashboardWidgetShell
      eyebrow="AI operations"
      title="AI Observability"
      subtitle="Operational health and expiration telemetry."
      compact
      rightSlot={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/ai-recommendations" className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20">
            Recommendations
          </Link>
          <Link href="/dashboard/ai-approvals" className="rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/20">
            Approvals
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="h-16 animate-pulse rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">{error}</div>
      ) : !data ? (
        <p className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-secondary)]">No AI observability data yet.</p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Active recs" value={String(data.recommendations.totalActive)} />
            <Metric label="Stale backlog" value={String(data.recommendations.stale)} />
            <Metric label="Pending approvals" value={String(data.approvals.pending)} />
            <Metric label="Cron health" value={healthLabel(data.health.cronProbablyRunning)} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip label={`Work Orders ${data.recommendations.byDomain.work_orders}`} />
            <Chip label={`Shop Boost ${data.recommendations.byDomain.shop_boost}`} />
            <Chip label={`Expired 24h ${data.expiration.recommendationsExpiredLast24h}`} />
            <Chip label={`Expired 7d ${data.expiration.recommendationsExpiredLast7d}`} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {flags.map((flag) => (
              <Chip key={flag.label} label={flag.label} tone={flag.active ? "warn" : "ok"} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 text-[11px] text-[color:var(--theme-text-secondary)] sm:grid-cols-2">
            <p>Last AI activity: <span className="text-[color:var(--theme-text-primary)]">{rel(data.events.lastEventAt)}</span></p>
            <p>Last stale expiration: <span className="text-[color:var(--theme-text-primary)]">{rel(data.expiration.lastExpirationEventAt)}</span></p>
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">{value}</p>
    </div>
  );
}

function Chip({ label, tone = "default" }: { label: string; tone?: "default" | "warn" | "ok" }) {
  const toneClass = tone === "warn"
    ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
    : tone === "ok"
      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
      : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]";

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${toneClass}`}>{label}</span>;
}
