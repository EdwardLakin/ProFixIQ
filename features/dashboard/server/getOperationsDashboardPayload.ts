import { endOfDay, startOfDay, startOfMonth } from "date-fns";

import {
  createDashboardServerClient,
  ensureDashboardShopContext,
  getDashboardIdentity,
  getMissingShopContextWarning,
} from "@/features/dashboard/server/dashboard-shell-data";

const OPEN_PART_STATUSES = ["requested", "quoted", "approved"] as const;
const CLOSED_LINE_STATUSES = ["completed", "ready_to_invoice", "invoiced"] as const;
const TECH_ROLES = new Set(["tech", "technician", "mechanic"]);

type OpSignal = {
  label: string;
  value: string;
  tone?: "default" | "accent";
  href?: string;
  targetKind?: "item" | "filtered";
};
type OpAction = {
  label: string;
  href: string;
  tone?: "primary" | "neutral";
  detail?: string;
};

export type OperationsDashboardPayload = {
  identity: Awaited<ReturnType<typeof getDashboardIdentity>>;
  viewerScope: "shop" | "technician";
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
  alerts: Array<{
    label: string;
    detail: string;
    tone: "critical" | "warning" | "info";
    href: string;
    targetKind: "item" | "filtered";
  }>;
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
  const normalizedRole = (identity.role ?? "").toLowerCase();
  const isTechnicianScoped = Boolean(identity.userId) && TECH_ROLES.has(normalizedRole);
  const payload: OperationsDashboardPayload = {
    identity,
    viewerScope: isTechnicianScoped ? "technician" : "shop",
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
    payload.sectionErrors.push(getMissingShopContextWarning(identity));
    return payload;
  }

  const supabase = createDashboardServerClient();
  const contextError = await ensureDashboardShopContext(supabase, identity, "Operations");
  if (contextError) {
    payload.sectionErrors.push(
      `Shop context RPC failed (${contextError.code ?? "no-code"}: ${contextError.message}); dashboard data may be limited by RLS.`,
    );
  }
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();
  const monthStart = startOfMonth(new Date()).toISOString();

  const approvalsQuery = supabase
    .from("work_order_lines")
    .select("id,work_order_id,status,updated_at", { count: "exact" })
    .eq("shop_id", identity.shopId)
    .in("approval_state", ["requested", "pending", "awaiting_approval"]);
  const scopedApprovalsQuery = isTechnicianScoped && identity.userId
    ? approvalsQuery.eq("assigned_tech_id", identity.userId)
    : approvalsQuery;

  const activeLinesQuery = supabase
    .from("work_order_lines")
    .select("id,work_order_id,assigned_tech_id,status,updated_at")
    .eq("shop_id", identity.shopId)
    .not("status", "in", `(${CLOSED_LINE_STATUSES.map((status) => `'${status}'`).join(",")})`)
    .not("assigned_tech_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(400);
  const scopedActiveLinesQuery = isTechnicianScoped && identity.userId
    ? activeLinesQuery.eq("assigned_tech_id", identity.userId)
    : activeLinesQuery;

  const [
    boardResult,
    approvalsResult,
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
      .limit(isTechnicianScoped ? 200 : 48),
    scopedApprovalsQuery,
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("shop_id", identity.shopId)
      .in("role", ["tech", "mechanic", "technician"]),
    scopedActiveLinesQuery,
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
  const activeLines = activeLinesResult.error ? [] : activeLinesResult.data ?? [];
  const buildOpenPartsQuery = () =>
    supabase
      .from("part_requests")
      .select("id,status,work_order_id,job_id,created_at,requested_by,assigned_to")
      .eq("shop_id", identity.shopId)
      .in("status", OPEN_PART_STATUSES as unknown as string[]);

  let partsRows: Array<{
    id: string;
    status: string;
    work_order_id: string | null;
    job_id: string | null;
    created_at: string;
    requested_by: string | null;
    assigned_to: string | null;
  }> = [];
  let partsQueryFailed = false;

  if (isTechnicianScoped && identity.userId) {
    const assignedLineIds = [...new Set(activeLines.map((line) => line.id).filter(Boolean))];
    const assignedWorkOrderIds = [
      ...new Set(activeLines.map((line) => line.work_order_id).filter((id): id is string => Boolean(id))),
    ];
    const partRowsById = new Map<string, (typeof partsRows)[number]>();

    const [partsByJobResult, partsByWorkOrderResult, partsByOwnerResult] = await Promise.all([
      assignedLineIds.length > 0
        ? buildOpenPartsQuery().in("job_id", assignedLineIds).limit(200)
        : Promise.resolve({ data: [], error: null }),
      assignedWorkOrderIds.length > 0
        ? buildOpenPartsQuery().in("work_order_id", assignedWorkOrderIds).limit(200)
        : Promise.resolve({ data: [], error: null }),
      buildOpenPartsQuery()
        .or(`requested_by.eq.${identity.userId},assigned_to.eq.${identity.userId}`)
        .limit(120),
    ]);

    if (partsByJobResult.error || partsByWorkOrderResult.error || partsByOwnerResult.error) {
      partsQueryFailed = true;
      console.error("[Dashboard][Operations] parts query failed", {
        shopId: identity.shopId,
        userId: identity.userId,
        partsByJobError: partsByJobResult.error?.message,
        partsByJobCode: partsByJobResult.error?.code,
        partsByWorkOrderError: partsByWorkOrderResult.error?.message,
        partsByWorkOrderCode: partsByWorkOrderResult.error?.code,
        partsByOwnerError: partsByOwnerResult.error?.message,
        partsByOwnerCode: partsByOwnerResult.error?.code,
      });
    }

    [partsByJobResult.data ?? [], partsByWorkOrderResult.data ?? [], partsByOwnerResult.data ?? []]
      .flat()
      .forEach((row) => {
        partRowsById.set(row.id, row);
      });

    partsRows = [...partRowsById.values()];
  } else {
    const shopPartsResult = await buildOpenPartsQuery().limit(240);
    if (shopPartsResult.error) {
      partsQueryFailed = true;
      console.error("[Dashboard][Operations] parts query failed", {
        shopId: identity.shopId,
        userId: identity.userId,
        error: shopPartsResult.error.message,
        code: shopPartsResult.error.code,
      });
    } else {
      partsRows = shopPartsResult.data ?? [];
    }
  }

  const scopedWorkOrderIds = new Set<string>();

  if (isTechnicianScoped) {
    const approvalRows = approvalsResult.error ? [] : approvalsResult.data ?? [];
    const scopedPartRows = partsRows;

    for (const row of approvalRows) {
      if (row.work_order_id) scopedWorkOrderIds.add(row.work_order_id);
    }
    for (const row of scopedPartRows) {
      if (row.work_order_id) scopedWorkOrderIds.add(row.work_order_id);
    }
  }

  for (const row of activeLines) {
    if (row.work_order_id) scopedWorkOrderIds.add(row.work_order_id);
  }

  const boardRowsForViewer = isTechnicianScoped
    ? boardRows.filter((row) => scopedWorkOrderIds.has(row.work_order_id))
    : boardRows;
  const activeBoardRows = boardRowsForViewer.filter((row) => row.overall_stage !== "completed");
  const mostRecentBlockedWorkOrderId =
    activeBoardRows.find(
      (row) => row.overall_stage === "waiting_parts" || row.overall_stage === "on_hold",
    )?.work_order_id ?? null;

  if (boardResult.error) {
    console.error("[Dashboard][Operations] live work query failed", {
      shopId: identity.shopId,
      userId: identity.userId,
      error: boardResult.error.message,
      code: boardResult.error.code,
    });
    payload.sectionErrors.push("Live work signal is temporarily unavailable.");
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
    console.error("[Dashboard][Operations] approvals query failed", {
      shopId: identity.shopId,
      userId: identity.userId,
      error: approvalsResult.error.message,
      code: approvalsResult.error.code,
    });
    payload.sectionErrors.push("Approvals signal is temporarily unavailable.");
  } else {
    payload.topSummary.waitingApprovals = approvalsResult.count ?? 0;
  }

  if (partsQueryFailed) {
    payload.sectionErrors.push("Parts blocker signal is temporarily unavailable.");
  } else {
    payload.topSummary.waitingParts = partsRows.length;
  }

  const recentApprovalLine = approvalsResult.error
    ? null
    : (approvalsResult.data ?? [])
        .filter((row) => !!row.work_order_id)
        .sort(
          (a, b) =>
            new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
        )[0] ?? null;
  const approvalTargetHref = recentApprovalLine?.work_order_id
    ? `/work-orders/${recentApprovalLine.work_order_id}`
    : "/work-orders/board?stage=awaiting_approval";
  const approvalTargetKind: "item" | "filtered" = recentApprovalLine?.work_order_id
    ? "item"
    : "filtered";

  const recentPartsRequest = partsQueryFailed
    ? null
    : partsRows
        .filter((row) => !!row.work_order_id)
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )[0] ?? null;
  const waitingPartsTargetHref = recentPartsRequest?.work_order_id
    ? `/work-orders/${recentPartsRequest.work_order_id}`
    : "/parts/requests?status=requested,quoted,approved";
  const waitingPartsTargetKind: "item" | "filtered" = recentPartsRequest?.work_order_id
    ? "item"
    : "filtered";

  const blockedTargetHref = mostRecentBlockedWorkOrderId
    ? `/work-orders/${mostRecentBlockedWorkOrderId}`
    : "/work-orders/board?stage=on_hold";
  const blockedTargetKind: "item" | "filtered" = mostRecentBlockedWorkOrderId
    ? "item"
    : "filtered";

  payload.blockerStack = [
    {
      label: isTechnicianScoped ? "My approvals pending" : "Approvals pending",
      value: String(payload.topSummary.waitingApprovals),
      tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default",
      href: approvalTargetHref,
      targetKind: approvalTargetKind,
    },
    {
      label: isTechnicianScoped ? "My open parts requests" : "Open parts requests",
      value: String(payload.topSummary.waitingParts),
      tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
      href: waitingPartsTargetHref,
      targetKind: waitingPartsTargetKind,
    },
    {
      label: isTechnicianScoped ? "My blocked jobs (parts/on hold)" : "Blocked jobs (parts/on hold)",
      value: String(payload.topSummary.blockedJobs),
      tone: payload.topSummary.blockedJobs > 0 ? "accent" : "default",
      href: blockedTargetHref,
      targetKind: blockedTargetKind,
    },
  ];

  if (bookingsTodayResult.error) {
    console.error("[Dashboard][Operations] daily summary query failed", {
      shopId: identity.shopId,
      userId: identity.userId,
      error: bookingsTodayResult.error.message,
      code: bookingsTodayResult.error.code,
    });
    payload.sectionErrors.push("Daily summary signal is temporarily unavailable.");
  }

  payload.dailySummary = isTechnicianScoped
    ? [
        { label: "My queue", value: String(payload.topSummary.activeJobs) },
        {
          label: "My approvals",
          value: String(payload.topSummary.waitingApprovals),
          tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default",
          href: approvalTargetHref,
          targetKind: approvalTargetKind,
        },
        {
          label: "My open parts requests",
          value: String(payload.topSummary.waitingParts),
          tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
          href: waitingPartsTargetHref,
          targetKind: waitingPartsTargetKind,
        },
        { label: "Today's bookings", value: String(bookingsTodayResult.count ?? 0) },
      ]
    : [
        { label: "Today's bookings", value: String(bookingsTodayResult.count ?? 0) },
        {
          label: "Approval queue",
          value: String(payload.topSummary.waitingApprovals),
          tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default",
          href: approvalTargetHref,
          targetKind: approvalTargetKind,
        },
        {
          label: "Open parts requests",
          value: String(payload.topSummary.waitingParts),
          tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
          href: waitingPartsTargetHref,
          targetKind: waitingPartsTargetKind,
        },
        { label: "Active board", value: String(payload.topSummary.activeJobs) },
      ];

  if (techProfilesResult.error || activeLinesResult.error) {
    payload.sectionErrors.push("Technician activity section is degraded due to query failures.");
  } else {
    const techs = techProfilesResult.data ?? [];
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
    const technicianRows = techs
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
      });

    payload.technicianActivity = isTechnicianScoped
      ? technicianRows.filter((tech) => tech.id === identity.userId)
      : technicianRows.sort((a, b) => b.activeLines - a.activeLines).slice(0, 6);
  }

  payload.alerts = [
    payload.topSummary.blockedJobs > 0
      ? {
          label: isTechnicianScoped ? "My blocked jobs need action" : "Blocked jobs climbing",
          detail: isTechnicianScoped
            ? `${payload.topSummary.blockedJobs} of your assigned jobs are waiting parts or on hold.`
            : `${payload.topSummary.blockedJobs} jobs are currently waiting parts or on hold.`,
          tone: "critical",
          href: blockedTargetHref,
          targetKind: blockedTargetKind,
        }
      : {
          label: isTechnicianScoped ? "My blocker pressure stable" : "Blocker pressure stable",
          detail: isTechnicianScoped
            ? "None of your assigned jobs are currently blocked."
            : "No blocked stage spike detected.",
          tone: "info",
          href: "/work-orders/board?stage=on_hold",
          targetKind: "filtered",
        },
    payload.topSummary.waitingApprovals > 3
      ? {
          label: isTechnicianScoped ? "My approvals are aging" : "Approval queue aging",
          detail: isTechnicianScoped
            ? `${payload.topSummary.waitingApprovals} of your lines need approval follow-up.`
            : `${payload.topSummary.waitingApprovals} approvals need advisor follow-up.`,
          tone: "warning",
          href: approvalTargetHref,
          targetKind: approvalTargetKind,
        }
      : {
          label: isTechnicianScoped ? "My approval queue healthy" : "Approval queue healthy",
          detail: isTechnicianScoped
            ? "Your approval-dependent lines are below action threshold."
            : "Approval queue is below action threshold.",
          tone: "info",
          href: "/work-orders/board?stage=awaiting_approval",
          targetKind: "filtered",
        },
    payload.topSummary.waitingParts > 0
      ? {
          label: isTechnicianScoped ? "My parts constraints active" : "Parts constraints active",
          detail: isTechnicianScoped
            ? `${payload.topSummary.waitingParts} of your part requests are still unresolved.`
            : `${payload.topSummary.waitingParts} open part requests still unresolved.`,
          tone: "warning",
          href: waitingPartsTargetHref,
          targetKind: waitingPartsTargetKind,
        }
      : {
          label: isTechnicianScoped ? "No parts constraints on my work" : "No parts constraints",
          detail: isTechnicianScoped
            ? "Your assigned jobs currently have no open parts blockers."
            : "Parts flow is currently clear.",
          tone: "info",
          href: "/parts/requests?status=requested,quoted,approved",
          targetKind: "filtered",
        },
  ];

  payload.suggestedActions = isTechnicianScoped
    ? [
        payload.topSummary.waitingParts > 0
          ? {
              label: "Follow up on my parts",
              href: waitingPartsTargetHref,
              tone: "primary",
              detail: "Parts delays are blocking your assigned work.",
            }
          : {
              label: "Open my active board",
              href: "/work-orders/board",
              tone: "neutral",
              detail: "Review your assigned jobs and move the next line forward.",
            },
        payload.topSummary.waitingApprovals > 0
          ? {
              label: "Nudge approvals",
              href: approvalTargetHref,
              tone: "primary",
              detail: "Pending approvals are holding your active lines.",
            }
          : {
              label: "Update next job status",
              href: "/work-orders/board",
              tone: "neutral",
              detail: "Keep your queue moving with clear status updates.",
            },
        {
          label: "Check dispatch notes",
          href: "/fleet/dispatch",
          tone: "neutral",
          detail: "Confirm assignment updates and immediate next actions.",
        },
      ]
    : [
        payload.topSummary.waitingApprovals > 0
          ? {
              label: "Clear approval queue",
              href: approvalTargetHref,
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
              href: waitingPartsTargetHref,
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
          href: "/fleet/dispatch",
          tone: "neutral",
          detail: "Review technician assignment and bay balancing.",
        },
      ];

  if (invoicesMonthResult.error) {
    console.error("[Dashboard][Operations] revenue snapshot query failed", {
      shopId: identity.shopId,
      userId: identity.userId,
      error: invoicesMonthResult.error.message,
      code: invoicesMonthResult.error.code,
    });
    payload.sectionErrors.push("Revenue snapshot is temporarily unavailable.");
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
