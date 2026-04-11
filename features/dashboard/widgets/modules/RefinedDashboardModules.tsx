"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import {
  DashboardActionBar,
  DashboardMetric,
  DashboardMetricRow,
  DashboardModuleHeader,
  DashboardModuleShell,
  DashboardSignalList,
  type DashboardModuleMode,
} from "@/features/dashboard/components/DashboardModuleSystem";
import { useDailySummary } from "@/features/agent/hooks/useDailySummary";
import { useSuggestedActions } from "@/features/assistant/hooks/useSuggestedActions";
import { useTechnicianLoadMetrics } from "@/features/dashboard/hooks/useTechnicianLoadMetrics";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";
import { useWorkOrderBoard } from "@/features/shared/hooks/useWorkOrderBoard";
import { getShopStats } from "@/features/shared/lib/stats/getShopStats";
import type { Database } from "@shared/types/types/supabase";
import { useEffect, useState } from "react";

function actionBtn() {
  return "rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:border-[color:var(--brand-accent)]";
}

export function DailySummaryModule({ mode }: { mode: DashboardModuleMode }) {
  const { data, loading, error, reload } = useDailySummary(true);

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader
        eyebrow="Operations"
        title="Daily Summary"
        action={<button type="button" onClick={() => void reload()} className={actionBtn()}>Refresh</button>}
      />
      {loading ? <div className="text-sm text-neutral-300">Loading summary…</div> : error || !data ? <div className="text-sm text-[color:var(--brand-accent)]">{error ?? "No summary available."}</div> : (
        <>
          <DashboardMetricRow>
            <DashboardMetric label="Actions" value={String(data.actionItems.length)} />
            <DashboardMetric label="Alerts" value={String(data.notifications.length)} tone="accent" />
            <DashboardMetric label="Links" value={String(data.links.length)} tone="primary" />
          </DashboardMetricRow>
          <DashboardSignalList
            items={[
              { label: data.notifications[0]?.title ?? "No urgent notifications", value: data.role.toUpperCase() },
              { label: data.actionItems[0] ?? "Monitor board flow" },
            ]}
          />
          <DashboardActionBar>
            <span className="text-[11px] text-neutral-500">Role-aware signal</span>
            <Link href={data.links[0]?.href ?? "/dashboard"} className={actionBtn()}>Open</Link>
          </DashboardActionBar>
        </>
      )}
    </DashboardModuleShell>
  );
}

export function SuggestedActionsModule({ mode, maxItems = 4 }: { mode: DashboardModuleMode; maxItems?: number }) {
  const { loading, data, reload } = useSuggestedActions(true, { pageType: "dashboard", pageTitle: "Dashboard" });
  const items = useMemo(() => {
    if (!data || "error" in data) return [];
    return [...data.items].sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.level] - ({ critical: 0, warning: 1, info: 2 }[b.level]))).slice(0, maxItems);
  }, [data, maxItems]);

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="AI Planner" title="Suggested Actions" action={<button type="button" onClick={() => void reload()} className={actionBtn()}>Refresh</button>} />
      {loading ? <div className="text-sm text-neutral-300">Loading actions…</div> : !data || ("error" in data) ? <div className="text-sm text-[color:var(--brand-accent)]">{data && "error" in data ? data.error : "No actions available."}</div> : (
        <>
          <DashboardSignalList items={items.map((item) => ({ label: item.title, value: item.level, tone: item.level === "critical" ? "accent" : "default" }))} />
          <DashboardActionBar>
            <span className="text-[11px] text-neutral-500">Top {items.length} actions</span>
            <Link href={items[0]?.href ?? "/assistant"} className={actionBtn()}>Open</Link>
          </DashboardActionBar>
        </>
      )}
    </DashboardModuleShell>
  );
}

export function LiveShopLoadModule({ shopId, mode }: { shopId: string | null; mode: DashboardModuleMode }) {
  const { metrics, loading, error } = useTechnicianLoadMetrics(shopId, { enabled: true, pollMs: 30_000 });
  const summary = metrics?.summary;

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="Live Ops" title="Live Shop Load" />
      {loading ? <div className="text-sm text-neutral-300">Loading load…</div> : error || !summary ? <div className="text-sm text-[color:var(--brand-accent)]">{error ?? "No load data."}</div> : (
        <>
          <DashboardMetric label="Utilization" value={`${summary.shopUtilizationPct}%`} tone="primary" />
          <DashboardMetricRow columns={2}>
            <DashboardMetric label="Active jobs" value={String(summary.totalActiveJobs)} />
            <DashboardMetric label="Active techs" value={`${summary.activeTechnicians}/${summary.totalTechnicians}`} tone="accent" />
          </DashboardMetricRow>
          <DashboardActionBar>
            <span className="text-[11px] text-neutral-500">{metrics?.timezone ?? "UTC"}</span>
            <Link href="/dashboard/operations" className={actionBtn()}>View</Link>
          </DashboardActionBar>
        </>
      )}
    </DashboardModuleShell>
  );
}

export function TechLoadModule({ shopId, mode }: { shopId: string | null; mode: DashboardModuleMode }) {
  const { metrics, loading, error } = useTechnicianLoadMetrics(shopId, { enabled: true, pollMs: 30_000 });
  const rows = metrics?.rows ?? [];
  const overloaded = rows.filter((row) => row.utilizationPct >= 85).length;

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="Team" title="Technician Load" />
      {loading ? <div className="text-sm text-neutral-300">Loading tech load…</div> : error ? <div className="text-sm text-[color:var(--brand-accent)]">{error}</div> : (
        <>
          <DashboardMetricRow>
            <DashboardMetric label="Tracked" value={String(rows.length)} />
            <DashboardMetric label="Busy now" value={String(rows.filter((r) => r.currentActiveJobs > 0).length)} tone="primary" />
            <DashboardMetric label="85%+" value={String(overloaded)} tone="accent" />
          </DashboardMetricRow>
          <DashboardSignalList items={rows.slice(0, 4).map((row) => ({ label: row.name, value: `${row.utilizationPct}%` }))} />
        </>
      )}
    </DashboardModuleShell>
  );
}

export function ShopPulseModule({ shopId, mode }: { shopId: string | null; mode: DashboardModuleMode }) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase.from("v_work_order_board_cards_shop").select("overall_stage,risk_level,priority").eq("shop_id", shopId).limit(80);
        if (queryError) throw queryError;
        const rows = data ?? [];
        const active = rows.filter((row) => row.overall_stage !== "completed").length;
        const blocked = rows.filter((row) => row.overall_stage === "waiting_parts" || row.overall_stage === "on_hold").length;
        const danger = rows.filter((row) => row.risk_level === "danger").length;
        const urgent = rows.filter((row) => row.priority === 1).length;
        if (!cancelled) {
          setMessages([
            { label: "Active work orders", value: String(active) },
            { label: "Blocked jobs", value: String(blocked) },
            { label: "High-risk", value: String(danger) },
            { label: "Urgent", value: String(urgent) },
          ]);
        }
      } catch (e) {
        if (!cancelled) setError(toDashboardFallbackMessage(e, "Data unavailable. Try refresh."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId, supabase]);

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="Operations" title="Shop Pulse" action={<Link href="/work-orders/board" className={actionBtn()}>Board</Link>} />
      {loading ? <div className="text-sm text-neutral-300">Loading pulse…</div> : error ? <div className="text-sm text-[color:var(--brand-accent)]">{error}</div> : <DashboardSignalList items={messages} />}
    </DashboardModuleShell>
  );
}

function money(n: number) { return `$${n.toFixed(0)}`; }

export function RevenueWatchModule({ shopId, mode }: { shopId: string | null; mode: DashboardModuleMode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ revenue: 0, profit: 0, jobs: 0 });

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const stats = await getShopStats(shopId, "monthly");
        if (!cancelled) setTotals({ revenue: stats.total.revenue, profit: stats.total.profit, jobs: stats.total.jobs });
      } catch (e) {
        if (!cancelled) setError(toDashboardFallbackMessage(e, "Data unavailable. Try refresh."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="Finance" title="Revenue Watch" action={<Link href="/dashboard/owner/reports" className={actionBtn()}>Reports</Link>} />
      {loading ? <div className="text-sm text-neutral-300">Loading revenue…</div> : error ? <div className="text-sm text-[color:var(--brand-accent)]">{error}</div> : (
        <DashboardMetricRow>
          <DashboardMetric label="Revenue" value={money(totals.revenue)} tone="primary" />
          <DashboardMetric label="Profit" value={money(totals.profit)} tone="accent" />
          <DashboardMetric label="Jobs" value={String(totals.jobs)} />
        </DashboardMetricRow>
      )}
    </DashboardModuleShell>
  );
}

export function PerformanceModule({ shopId, mode }: { shopId: string | null; mode: DashboardModuleMode }) {
  const { metrics, loading, error } = useTechnicianLoadMetrics(shopId, { enabled: true, pollMs: 30_000 });
  const rows = metrics?.rows ?? [];
  const completed = rows.reduce((sum, row) => sum + row.completedJobsToday, 0);
  const avgDurationMin = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.avgJobDurationSeconds, 0) / rows.length / 60) : 0;

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="Performance" title="Technician Performance" />
      {loading ? <div className="text-sm text-neutral-300">Loading performance…</div> : error ? <div className="text-sm text-[color:var(--brand-accent)]">{error}</div> : (
        <>
          <DashboardMetricRow columns={2}>
            <DashboardMetric label="Completed" value={String(completed)} tone="primary" />
            <DashboardMetric label="Avg duration" value={`${avgDurationMin}m`} />
          </DashboardMetricRow>
          <DashboardSignalList items={rows.slice(0, 4).map((row) => ({ label: row.name, value: `${row.completedJobsToday} jobs` }))} />
        </>
      )}
    </DashboardModuleShell>
  );
}

export function WorkOrderBoardModule({ mode }: { mode: DashboardModuleMode }) {
  const { rows, loading, error, refetch } = useWorkOrderBoard("shop", { limit: 10 });
  const active = rows.filter((row) => row.overall_stage !== "completed").length;

  return (
    <DashboardModuleShell mode={mode}>
      <DashboardModuleHeader eyebrow="Board" title="Work Order Board" action={<button type="button" onClick={() => void refetch()} className={actionBtn()}>Refresh</button>} />
      {loading ? <div className="text-sm text-neutral-300">Loading board…</div> : error ? <div className="text-sm text-[color:var(--brand-accent)]">{error}</div> : (
        <>
          <DashboardMetricRow columns={2}>
            <DashboardMetric label="Active" value={String(active)} tone="primary" />
            <DashboardMetric label="Completed" value={String(rows.length - active)} />
          </DashboardMetricRow>
          <DashboardSignalList items={rows.slice(0, 5).map((row) => ({ label: row.custom_id ?? row.display_name ?? row.work_order_id.slice(0, 8), value: row.overall_stage?.replaceAll("_", " ") ?? "active" }))} />
          <DashboardActionBar>
            <span className="text-[11px] text-neutral-500">Live queue snapshot</span>
            <Link href="/work-orders/board" className={actionBtn()}>Open board</Link>
          </DashboardActionBar>
        </>
      )}
    </DashboardModuleShell>
  );
}
