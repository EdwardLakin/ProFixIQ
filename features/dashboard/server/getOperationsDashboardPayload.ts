import { endOfDay, startOfDay, startOfMonth } from "date-fns";

import { createDashboardServerClient, getDashboardIdentity } from "@/features/dashboard/server/dashboard-shell-data";

const OPEN_PART_STATUSES = ["requested", "quoted", "approved"] as const;
const CLOSED_LINE_STATUSES = ["completed", "ready_to_invoice", "invoiced"] as const;

type OpSignal = { label: string; value: string; tone?: "default" | "accent" };
type OpAction = {
  label: string;
  href: string;
  tone?: "primary" | "neutral";
  detail?: string;
};

export type OperationsDashboardPayload = {
  identity: Awaited<ReturnType<typeof getDashboardIdentity>>;
  topSummary: {
    activeJobs: number;
    blockedJobs: number;
    waitingApprovals: number;
    waitingParts: number;
  };
  activeJobSummary: Array<{ label: string; value: number; pct: number }>;
  liveShopLoad: Array<{ label: string; count: number; pct: number }>;
  dailySummary: OpSignal[];
  liveWork: Array<{
    id: string;
    label: string;
    stage: string;
    risk: string;
    priority: number;
  }>;
  technicianActivity: Array<{
    id: string;
    name: string;
    activeLines: number;
    stage: string;
    elapsed: string;
    utilizationPct: number;
  }>;
  blockerStack: OpSignal[];
  alerts: Array<{ label: string; detail: string; tone: "critical" | "warning" | "info" }>;
  suggestedActions: OpAction[];
  flowMix: Array<{ label: string; value: number }>;
  revenueEfficiency: {
    revenue: number;
    profit: number;
    completedLines: number;
    efficiencyPct: number;
  };
  sectionErrors: string[];
  fetchAudit: string[];
};

function stageLabel(stage: string | null | undefined): string {
  return (stage ?? "in_progress").replaceAll("_", " ");
}

function asPct(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function elapsedLabel(updatedAt: string | null): string {
  if (!updatedAt) return "--";
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "--";
  const mins = Math.round(diffMs / (1000 * 60));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

export async function getOperationsDashboardPayload(): Promise<OperationsDashboardPayload> {
  const identity = await getDashboardIdentity();
  const payload: OperationsDashboardPayload = {
    identity,
    topSummary: {
      activeJobs: 0,
      blockedJobs: 0,
      waitingApprovals: 0,
      waitingParts: 0,
    },
    activeJobSummary: [],
    liveShopLoad: [],
    dailySummary: [],
    liveWork: [],
    technicianActivity: [],
    blockerStack: [],
    alerts: [],
    suggestedActions: [],
    flowMix: [],
    revenueEfficiency: {
      revenue: 0,
      profit: 0,
      completedLines: 0,
      efficiencyPct: 0,
    },
    sectionErrors: [],
    fetchAudit: [],
  };

  if (!identity.shopId) {
    payload.sectionErrors.push("No shop context found for this user.");
    return payload;
  }

  const supabase = createDashboardServerClient();
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();
  const monthStart = startOfMonth(new Date()).toISOString();

  const [
    boardResult,
    approvalsResult,
    partsResult,
    techProfilesResult,
    activeLinesResult,
    invoicesMonthResult,
    bookingsTodayResult,
  ] = await Promise.all([
    supabase
      .from("v_work_order_board_cards_shop")
      .select("work_order_id,custom_id,display_name,overall_stage,risk_level,priority")
      .eq("shop_id", identity.shopId)
      .order("activity_at", { ascending: false })
      .limit(48),
    supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", identity.shopId)
      .in("approval_state", ["requested", "pending", "awaiting_approval"]),
    supabase
      .from("part_requests")
      .select("id,status", { count: "exact" })
      .eq("shop_id", identity.shopId)
      .in("status", OPEN_PART_STATUSES as unknown as string[])
      .limit(120),
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("shop_id", identity.shopId)
      .in("role", ["tech", "mechanic", "technician"]),
    supabase
      .from("work_order_lines")
      .select("assigned_tech_id,status,updated_at")
      .eq("shop_id", identity.shopId)
      .not("status", "in", `(${CLOSED_LINE_STATUSES.map((status) => `'${status}'`).join(",")})`)
      .not("assigned_tech_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(400),
    supabase
      .from("invoices")
      .select("total,labor_cost,created_at")
      .eq("shop_id", identity.shopId)
      .gte("created_at", monthStart),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", identity.shopId)
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd),
  ]);

  const boardRows = boardResult.error ? [] : boardResult.data ?? [];
  const activeBoardRows = boardRows.filter((row) => row.overall_stage !== "completed");

  if (boardResult.error) {
    payload.sectionErrors.push(`Live work section: ${boardResult.error.message}`);
  } else {
    payload.topSummary.activeJobs = activeBoardRows.length;
    payload.topSummary.blockedJobs = activeBoardRows.filter(
      (row) => row.overall_stage === "waiting_parts" || row.overall_stage === "on_hold",
    ).length;

    const stageCounts = new Map<string, number>();
    activeBoardRows.forEach((row) => {
      const key = stageLabel(row.overall_stage);
      stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
    });

    const total = activeBoardRows.length;
    payload.liveShopLoad = [...stageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count, pct: asPct(count, total) }));

    const awaiting = stageCounts.get("awaiting approval") ?? 0;
    const inProgress = stageCounts.get("in progress") ?? 0;
    const waitingParts = stageCounts.get("waiting parts") ?? 0;
    payload.activeJobSummary = [
      { label: "Awaiting", value: awaiting, pct: asPct(awaiting, total) },
      { label: "In progress", value: inProgress, pct: asPct(inProgress, total) },
      { label: "Waiting parts", value: waitingParts, pct: asPct(waitingParts, total) },
      {
        label: "Tech coverage",
        value: Math.min(total, (techProfilesResult.data ?? []).length),
        pct: asPct(Math.min(total, (techProfilesResult.data ?? []).length), Math.max(total, 1)),
      },
    ];

    payload.liveWork = activeBoardRows.slice(0, 7).map((row) => ({
      id: row.work_order_id,
      label: row.custom_id ?? row.display_name ?? row.work_order_id.slice(0, 8),
      stage: stageLabel(row.overall_stage),
      risk: row.risk_level ?? "none",
      priority: row.priority ?? 3,
    }));

    payload.flowMix = payload.liveShopLoad.slice(0, 4).map((entry) => ({
      label: entry.label,
      value: entry.count,
    }));
  }

  if (approvalsResult.error) {
    payload.sectionErrors.push(`Approvals section: ${approvalsResult.error.message}`);
  } else {
    payload.topSummary.waitingApprovals = approvalsResult.count ?? 0;
  }

  if (partsResult.error) {
    payload.sectionErrors.push(`Parts blocker section: ${partsResult.error.message}`);
  } else {
    payload.topSummary.waitingParts = partsResult.count ?? (partsResult.data ?? []).length;
  }

  payload.blockerStack = [
    {
      label: "Approvals pending",
      value: String(payload.topSummary.waitingApprovals),
      tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default",
    },
    {
      label: "Waiting parts",
      value: String(payload.topSummary.waitingParts),
      tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
    },
    {
      label: "On hold / blocked",
      value: String(payload.topSummary.blockedJobs),
      tone: payload.topSummary.blockedJobs > 0 ? "accent" : "default",
    },
  ];

  if (bookingsTodayResult.error) {
    payload.sectionErrors.push(`Daily summary section: ${bookingsTodayResult.error.message}`);
  }

  payload.dailySummary = [
    { label: "Today's bookings", value: String(bookingsTodayResult.count ?? 0) },
    { label: "Approval queue", value: String(payload.topSummary.waitingApprovals), tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default" },
    { label: "Parts waiting", value: String(payload.topSummary.waitingParts), tone: payload.topSummary.waitingParts > 0 ? "accent" : "default" },
    { label: "Active board", value: String(payload.topSummary.activeJobs) },
  ];

  if (techProfilesResult.error || activeLinesResult.error) {
    payload.sectionErrors.push("Technician activity section is degraded due to query failures.");
  } else {
    const techs = techProfilesResult.data ?? [];
    const activeLines = activeLinesResult.data ?? [];
    const counts = new Map<string, { activeLines: number; latestStatus: string; lastUpdated: string | null }>();

    activeLines.forEach((line) => {
      if (!line.assigned_tech_id) return;
      const previous = counts.get(line.assigned_tech_id);
      counts.set(line.assigned_tech_id, {
        activeLines: (previous?.activeLines ?? 0) + 1,
        latestStatus: previous?.latestStatus ?? stageLabel(line.status),
        lastUpdated: previous?.lastUpdated ?? line.updated_at,
      });
    });

    const maxLines = Math.max(1, ...[...counts.values()].map((entry) => entry.activeLines));
    payload.technicianActivity = techs
      .map((tech) => {
        const activity = counts.get(tech.id);
        return {
          id: tech.id,
          name: tech.full_name ?? "Unassigned tech",
          activeLines: activity?.activeLines ?? 0,
          stage: activity?.latestStatus ?? "idle",
          elapsed: elapsedLabel(activity?.lastUpdated ?? null),
          utilizationPct: asPct(activity?.activeLines ?? 0, maxLines),
        };
      })
      .sort((a, b) => b.activeLines - a.activeLines)
      .slice(0, 6);
  }

  payload.alerts = [
    payload.topSummary.blockedJobs > 0
      ? {
          label: "Blocked jobs climbing",
          detail: `${payload.topSummary.blockedJobs} jobs currently in blocked stages.`,
          tone: "critical",
        }
      : {
          label: "Blocker pressure stable",
          detail: "No blocked stage spike detected.",
          tone: "info",
        },
    payload.topSummary.waitingApprovals > 3
      ? {
          label: "Approval queue aging",
          detail: `${payload.topSummary.waitingApprovals} approvals need advisor follow-up.`,
          tone: "warning",
        }
      : {
          label: "Approval queue healthy",
          detail: "Approval queue is below action threshold.",
          tone: "info",
        },
    payload.topSummary.waitingParts > 0
      ? {
          label: "Parts constraints active",
          detail: `${payload.topSummary.waitingParts} open part requests still unresolved.`,
          tone: "warning",
        }
      : {
          label: "No parts constraints",
          detail: "Parts flow is currently clear.",
          tone: "info",
        },
  ];

  payload.suggestedActions = [
    payload.topSummary.waitingApprovals > 0
      ? {
          label: "Clear approval queue",
          href: "/work-orders/board?stage=awaiting_approval",
          tone: "primary",
          detail: "Prioritize pending approvals to free advisor handoffs.",
        }
      : {
          label: "Review active board",
          href: "/work-orders/board",
          tone: "neutral",
          detail: "No immediate queue pressure detected.",
        },
    payload.topSummary.waitingParts > 0
      ? {
          label: "Resolve waiting parts",
          href: "/dashboard/operations?focus=parts",
          tone: "primary",
          detail: "Parts backlog is blocking active jobs.",
        }
      : {
          label: "Create work order",
          href: "/work-orders/create",
          tone: "neutral",
          detail: "Keep bay utilization steady with next intake.",
        },
    {
      label: "Open dispatch view",
      href: "/dashboard/manager/dispatch",
      tone: "neutral",
      detail: "Review technician assignment and bay balancing.",
    },
  ];

  if (invoicesMonthResult.error) {
    payload.sectionErrors.push(`Revenue snapshot section: ${invoicesMonthResult.error.message}`);
  } else {
    const invoices = invoicesMonthResult.data ?? [];
    const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
    const profit = invoices.reduce(
      (sum, invoice) => sum + Number(invoice.total ?? 0) - Number(invoice.labor_cost ?? 0),
      0,
    );

    payload.revenueEfficiency = {
      revenue: Math.round(revenue),
      profit: Math.round(profit),
      completedLines: payload.technicianActivity.reduce((sum, tech) => sum + tech.activeLines, 0),
      efficiencyPct: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    };
  }

  payload.fetchAudit.push("Operations dashboard now renders from one server payload with composed panel data.");

  return payload;
}
