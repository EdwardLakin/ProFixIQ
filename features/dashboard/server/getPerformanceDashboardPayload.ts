import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import { createDashboardServerClient, getDashboardIdentity } from "@/features/dashboard/server/dashboard-shell-data";

type TrendPoint = {
  label: string;
  revenue: number;
  jobs: number;
  profit: number;
};

type PerfSignal = {
  label: string;
  value: string;
  tone?: "default" | "accent";
};

export type PerformanceDashboardPayload = {
  identity: Awaited<ReturnType<typeof getDashboardIdentity>>;
  kpis: {
    revenue: number;
    profit: number;
    jobs: number;
    efficiencyPct: number;
  };
  trend: TrendPoint[];
  technicianPerformance: Array<{ label: string; completed: number; pace: string; utilizationPct: number }>;
  businessSignals: PerfSignal[];
  revenueWatch: Array<{ label: string; value: string; tone?: "default" | "accent" }>;
  optimizationSummary: Array<{ label: string; detail: string; tone: "critical" | "warning" | "info" }>;
  sectionErrors: string[];
  fetchAudit: string[];
};

function asMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function pct(delta: number, baseline: number): number {
  if (!baseline) return 0;
  return Math.round((delta / baseline) * 100);
}

export async function getPerformanceDashboardPayload(): Promise<PerformanceDashboardPayload> {
  const identity = await getDashboardIdentity();
  const payload: PerformanceDashboardPayload = {
    identity,
    kpis: { revenue: 0, profit: 0, jobs: 0, efficiencyPct: 0 },
    trend: [],
    technicianPerformance: [],
    businessSignals: [],
    revenueWatch: [],
    optimizationSummary: [],
    sectionErrors: [],
    fetchAudit: [],
  };

  if (!identity.shopId) {
    payload.sectionErrors.push("No shop context found for this user.");
    return payload;
  }

  const supabase = createDashboardServerClient();
  const rangeStart = startOfMonth(subMonths(new Date(), 5)).toISOString();
  const rangeEnd = endOfMonth(new Date()).toISOString();

  const [invoiceResult, expenseResult, techProfilesResult, completedLinesResult, comebackRiskResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("id,total,labor_cost,created_at")
      .eq("shop_id", identity.shopId)
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd),
    supabase
      .from("expenses")
      .select("amount,created_at")
      .eq("shop_id", identity.shopId)
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd),
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("shop_id", identity.shopId)
      .in("role", ["tech", "mechanic", "technician"]),
    supabase
      .from("work_order_lines")
      .select("assigned_tech_id,status,updated_at")
      .eq("shop_id", identity.shopId)
      .gte("updated_at", startOfMonth(new Date()).toISOString())
      .in("status", ["completed", "ready_to_invoice", "invoiced"])
      .not("assigned_tech_id", "is", null)
      .limit(500),
    supabase
      .from("v_work_order_board_cards_shop")
      .select("risk_level,overall_stage")
      .eq("shop_id", identity.shopId)
      .limit(140),
  ]);

  if (invoiceResult.error || expenseResult.error) {
    payload.sectionErrors.push("Finance trend section is degraded due to invoice/expense query failures.");
  } else {
    const invoices = invoiceResult.data ?? [];
    const expenses = expenseResult.data ?? [];

    const monthBuckets = new Map<string, TrendPoint>();
    for (let i = 5; i >= 0; i -= 1) {
      const monthDate = subMonths(new Date(), i);
      const key = format(monthDate, "yyyy-MM");
      monthBuckets.set(key, {
        label: format(monthDate, "MMM"),
        revenue: 0,
        jobs: 0,
        profit: 0,
      });
    }

    invoices.forEach((invoice) => {
      const key = format(new Date(invoice.created_at ?? new Date()), "yyyy-MM");
      const bucket = monthBuckets.get(key);
      if (!bucket) return;

      const total = Number(invoice.total ?? 0);
      const labor = Number(invoice.labor_cost ?? 0);
      bucket.revenue += total;
      bucket.jobs += 1;
      bucket.profit += total - labor;
    });

    expenses.forEach((expense) => {
      const key = format(new Date(expense.created_at ?? new Date()), "yyyy-MM");
      const bucket = monthBuckets.get(key);
      if (!bucket) return;

      bucket.profit -= Number(expense.amount ?? 0);
    });

    payload.trend = [...monthBuckets.values()].map((bucket) => ({
      ...bucket,
      revenue: asMoney(bucket.revenue),
      profit: asMoney(bucket.profit),
    }));

    const latest = payload.trend[payload.trend.length - 1];
    const previous = payload.trend[payload.trend.length - 2];
    payload.kpis.revenue = latest?.revenue ?? 0;
    payload.kpis.profit = latest?.profit ?? 0;
    payload.kpis.jobs = latest?.jobs ?? 0;
    payload.kpis.efficiencyPct = payload.kpis.revenue > 0 ? Math.round((payload.kpis.profit / payload.kpis.revenue) * 100) : 0;

    const revenueDelta = (latest?.revenue ?? 0) - (previous?.revenue ?? 0);
    const jobsDelta = (latest?.jobs ?? 0) - (previous?.jobs ?? 0);
    payload.revenueWatch = [
      {
        label: "Revenue vs last month",
        value: `${revenueDelta >= 0 ? "+" : ""}${pct(revenueDelta, previous?.revenue ?? 0)}%`,
        tone: revenueDelta < 0 ? "accent" : "default",
      },
      {
        label: "Jobs pace",
        value: `${jobsDelta >= 0 ? "+" : ""}${jobsDelta}`,
        tone: jobsDelta < 0 ? "accent" : "default",
      },
      {
        label: "Current margin",
        value: `${payload.kpis.efficiencyPct}%`,
      },
    ];
  }

  if (techProfilesResult.error || completedLinesResult.error) {
    payload.sectionErrors.push("Technician performance section is degraded due to work-order line query failures.");
  } else {
    const techs = techProfilesResult.data ?? [];
    const completed = completedLinesResult.data ?? [];
    const byTech = new Map<string, number>();

    completed.forEach((row) => {
      if (!row.assigned_tech_id) return;
      byTech.set(row.assigned_tech_id, (byTech.get(row.assigned_tech_id) ?? 0) + 1);
    });

    const maxCompleted = Math.max(1, ...[...byTech.values()]);
    payload.technicianPerformance = techs
      .map((tech) => {
        const completedCount = byTech.get(tech.id) ?? 0;
        return {
          label: tech.full_name ?? "Unassigned tech",
          completed: completedCount,
          pace: completedCount >= Math.ceil(maxCompleted * 0.75) ? "On pace" : "Watch",
          utilizationPct: Math.round((completedCount / maxCompleted) * 100),
        };
      })
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 6);
  }

  if (comebackRiskResult.error) {
    payload.sectionErrors.push("Business signals section is degraded due to board risk query failures.");
  } else {
    const riskRows = comebackRiskResult.data ?? [];
    const highRisk = riskRows.filter((row) => row.risk_level === "danger").length;
    const warnRisk = riskRows.filter((row) => row.risk_level === "warn").length;
    const onHold = riskRows.filter((row) => row.overall_stage === "on_hold").length;

    payload.businessSignals = [
      { label: "Comeback risk", value: String(highRisk), tone: highRisk > 0 ? "accent" : "default" },
      { label: "Margin watch", value: `${payload.kpis.efficiencyPct}%` },
      { label: "Warning queue", value: String(warnRisk), tone: warnRisk > 0 ? "accent" : "default" },
      { label: "On-hold revenue", value: String(onHold), tone: onHold > 0 ? "accent" : "default" },
    ];

    payload.optimizationSummary = [
      highRisk > 0
        ? {
            label: "Comeback exposure",
            detail: `${highRisk} high-risk jobs require immediate QA review.`,
            tone: "critical",
          }
        : {
            label: "Comeback exposure",
            detail: "No critical comeback concentration detected.",
            tone: "info",
          },
      warnRisk > 0
        ? {
            label: "Margin pressure",
            detail: `${warnRisk} jobs are in warning tier for margin.`,
            tone: "warning",
          }
        : {
            label: "Margin pressure",
            detail: "Warning-tier margin pressure is currently low.",
            tone: "info",
          },
      onHold > 0
        ? {
            label: "On-hold revenue",
            detail: `${onHold} jobs are stalled and carrying deferred revenue.`,
            tone: "warning",
          }
        : {
            label: "On-hold revenue",
            detail: "No material on-hold revenue risk right now.",
            tone: "info",
          },
    ];
  }

  payload.fetchAudit.push("Performance dashboard now ships a single curated payload with finance, throughput, and risk sections.");

  return payload;
}
