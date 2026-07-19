import { endOfDay, startOfDay } from "date-fns";

import {
  createDashboardServerClient,
  getDashboardIdentity,
} from "@/features/dashboard/server/dashboard-shell-data";

const OPEN_PART_STATUSES = [
  "requested",
  "quoted",
  "approved",
  "partially_ordered",
  "partially_consumed",
  "partially_returned",
] as const;

type OpenPartRow = {
  id: string;
  status: string;
  work_order_id: string | null;
  job_id: string | null;
  created_at: string;
  requested_by: string | null;
  assigned_to: string | null;
};

type OpenPartScope =
  | { kind: "shop" }
  | { kind: "job"; ids: string[] }
  | { kind: "work_order"; ids: string[] }
  | { kind: "owner"; userId: string };
const CLOSED_LINE_STATUSES = [
  "completed",
  "ready_to_invoice",
  "invoiced",
] as const;
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
    techniciansClockedIn: number;
    appointmentsToday: number;
    completedToday: number;
  };
  immediateAttention: OpSignal[];
  todayOperations: OpSignal[];
  quickActions: OpAction[];
  recentOperationalActivity: OpSignal[];
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
  const supabase = createDashboardServerClient();
  const identity = await getDashboardIdentity(supabase);
  const normalizedRole = (identity.role ?? "").toLowerCase();
  const isTechnicianScoped =
    Boolean(identity.userId) && TECH_ROLES.has(normalizedRole);
  const payload: OperationsDashboardPayload = {
    identity,
    viewerScope: isTechnicianScoped ? "technician" : "shop",
    topSummary: {
      activeJobs: 0,
      blockedJobs: 0,
      waitingApprovals: 0,
      waitingParts: 0,
      techniciansClockedIn: 0,
      appointmentsToday: 0,
      completedToday: 0,
    },
    immediateAttention: [],
    todayOperations: [],
    quickActions: [],
    recentOperationalActivity: [],
    activeJobSummary: [],
    liveShopLoad: [],
    dailySummary: [],
    liveWork: [],
    technicianActivity: [],
    blockerStack: [],
    alerts: [],
    suggestedActions: [],
    flowMix: [],
    sectionErrors: [],
    fetchAudit: [],
  };

  if (!identity.shopId) {
    payload.sectionErrors.push("No shop context found for this user.");
    return payload;
  }

  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const approvalsQuery = supabase
    .from("work_order_lines")
    .select("id,work_order_id,status,updated_at", { count: "exact" })
    .eq("shop_id", identity.shopId)
    .in("approval_state", ["requested", "pending", "awaiting_approval"]);
  const scopedApprovalsQuery =
    isTechnicianScoped && identity.userId
      ? approvalsQuery.eq("assigned_tech_id", identity.userId)
      : approvalsQuery;

  const activeLinesQuery = supabase
    .from("work_order_lines")
    .select("id,work_order_id,assigned_tech_id,status,updated_at")
    .eq("shop_id", identity.shopId)
    .not(
      "status",
      "in",
      `(${CLOSED_LINE_STATUSES.map((status) => `'${status}'`).join(",")})`,
    )
    .not("assigned_tech_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(400);
  const scopedActiveLinesQuery =
    isTechnicianScoped && identity.userId
      ? activeLinesQuery.eq("assigned_tech_id", identity.userId)
      : activeLinesQuery;

  const [
    boardResult,
    approvalsResult,
    techProfilesResult,
    activeLinesResult,
    bookingsTodayResult,
    clockedInResult,
    completedTodayResult,
  ] = await Promise.all([
    supabase
      .from("v_work_order_board_cards_shop")
      .select(
        "work_order_id,custom_id,display_name,overall_stage,risk_level,priority,is_waiter,time_in_stage_seconds",
      )
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
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", identity.shopId)
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd),
    supabase
      .from("tech_shifts")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", identity.shopId)
      .is("end_time", null),
    supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", identity.shopId)
      .eq("status", "completed")
      .gte("updated_at", todayStart)
      .lte("updated_at", todayEnd),
  ]);

  const boardRows = boardResult.error ? [] : (boardResult.data ?? []);
  const activeLines = activeLinesResult.error
    ? []
    : (activeLinesResult.data ?? []);
  const buildOpenPartsQuery = () =>
    supabase
      .from("part_requests")
      .select(
        "id,status,work_order_id,job_id,created_at,requested_by,assigned_to",
      )
      .eq("shop_id", identity.shopId)
      .in("status", OPEN_PART_STATUSES as unknown as string[]);

  const fetchOpenParts = async (
    scope: OpenPartScope,
  ): Promise<{ data: OpenPartRow[]; error: { message: string } | null }> => {
    const data: OpenPartRow[] = [];
    const pageSize = 500;
    const idChunks =
      scope.kind === "job" || scope.kind === "work_order"
        ? Array.from(
            { length: Math.ceil(scope.ids.length / 200) },
            (_, index) => scope.ids.slice(index * 200, index * 200 + 200),
          )
        : [null];

    for (const ids of idChunks) {
      for (let offset = 0; ; offset += pageSize) {
        let query = buildOpenPartsQuery()
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (scope.kind === "job") query = query.in("job_id", ids ?? []);
        else if (scope.kind === "work_order") {
          query = query.in("work_order_id", ids ?? []);
        } else if (scope.kind === "owner") {
          query = query.or(
            `requested_by.eq.${scope.userId},assigned_to.eq.${scope.userId}`,
          );
        }

        const result = await query;
        if (result.error) return { data: [], error: result.error };
        const page = (result.data ?? []) as OpenPartRow[];
        data.push(...page);
        if (page.length < pageSize) break;
      }
    }
    return { data, error: null };
  };

  let partsRows: OpenPartRow[] = [];
  let partsQueryFailed = false;

  if (isTechnicianScoped && identity.userId) {
    const assignedLineIds = [
      ...new Set(activeLines.map((line) => line.id).filter(Boolean)),
    ];
    const assignedWorkOrderIds = [
      ...new Set(
        activeLines
          .map((line) => line.work_order_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const partRowsById = new Map<string, (typeof partsRows)[number]>();

    const [partsByJobResult, partsByWorkOrderResult, partsByOwnerResult] =
      await Promise.all([
        assignedLineIds.length > 0
          ? fetchOpenParts({ kind: "job", ids: assignedLineIds })
          : Promise.resolve({ data: [], error: null }),
        assignedWorkOrderIds.length > 0
          ? fetchOpenParts({ kind: "work_order", ids: assignedWorkOrderIds })
          : Promise.resolve({ data: [], error: null }),
        fetchOpenParts({ kind: "owner", userId: identity.userId }),
      ]);

    if (
      partsByJobResult.error ||
      partsByWorkOrderResult.error ||
      partsByOwnerResult.error
    ) {
      partsQueryFailed = true;
      console.error("[Dashboard][Operations] parts query failed", {
        shopId: identity.shopId,
        userId: identity.userId,
        partsByJobError: partsByJobResult.error?.message,
        partsByWorkOrderError: partsByWorkOrderResult.error?.message,
        partsByOwnerError: partsByOwnerResult.error?.message,
      });
    }

    [
      partsByJobResult.data ?? [],
      partsByWorkOrderResult.data ?? [],
      partsByOwnerResult.data ?? [],
    ]
      .flat()
      .forEach((row) => {
        partRowsById.set(row.id, row);
      });

    partsRows = [...partRowsById.values()];
  } else {
    const shopPartsResult = await fetchOpenParts({ kind: "shop" });
    if (shopPartsResult.error) {
      partsQueryFailed = true;
      console.error("[Dashboard][Operations] parts query failed", {
        shopId: identity.shopId,
        userId: identity.userId,
        error: shopPartsResult.error.message,
      });
    } else {
      partsRows = shopPartsResult.data ?? [];
    }
  }

  const scopedWorkOrderIds = new Set<string>();

  if (isTechnicianScoped) {
    const approvalRows = approvalsResult.error
      ? []
      : (approvalsResult.data ?? []);
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
  const activeBoardRows = boardRowsForViewer.filter(
    (row) => row.overall_stage !== "completed",
  );
  const mostRecentBlockedWorkOrderId =
    activeBoardRows.find(
      (row) =>
        row.overall_stage === "waiting_parts" ||
        row.overall_stage === "on_hold",
    )?.work_order_id ?? null;

  if (boardResult.error) {
    console.error("[Dashboard][Operations] live work query failed", {
      shopId: identity.shopId,
      userId: identity.userId,
      error: boardResult.error.message,
    });
    payload.sectionErrors.push("Live work signal is temporarily unavailable.");
  } else {
    payload.topSummary.activeJobs = activeBoardRows.length;
    payload.topSummary.completedToday = completedTodayResult.error ? 0 : (completedTodayResult.count ?? 0);
    payload.topSummary.blockedJobs = activeBoardRows.filter(
      (row) =>
        row.overall_stage === "waiting_parts" ||
        row.overall_stage === "on_hold",
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
      {
        label: "In progress",
        value: inProgress,
        pct: asPct(inProgress, total),
      },
      {
        label: "Waiting parts",
        value: waitingParts,
        pct: asPct(waitingParts, total),
      },
      {
        label: "Tech coverage",
        value: Math.min(total, (techProfilesResult.data ?? []).length),
        pct: asPct(
          Math.min(total, (techProfilesResult.data ?? []).length),
          Math.max(total, 1),
        ),
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
    });
    payload.sectionErrors.push("Approvals signal is temporarily unavailable.");
  } else {
    payload.topSummary.waitingApprovals = approvalsResult.count ?? 0;
  }

  if (partsQueryFailed) {
    payload.sectionErrors.push(
      "Parts blocker signal is temporarily unavailable.",
    );
  } else {
    payload.topSummary.waitingParts = new Set(
      partsRows.map((row) => row.work_order_id ?? `request:${row.id}`),
    ).size;
  }

  const recentApprovalLine = approvalsResult.error
    ? null
    : ((approvalsResult.data ?? [])
        .filter((row) => !!row.work_order_id)
        .sort(
          (a, b) =>
            new Date(b.updated_at ?? 0).getTime() -
            new Date(a.updated_at ?? 0).getTime(),
        )[0] ?? null);
  const approvalTargetHref = recentApprovalLine?.work_order_id
    ? `/work-orders/${recentApprovalLine.work_order_id}`
    : "/work-orders/board?stage=awaiting_approval";
  const approvalTargetKind: "item" | "filtered" =
    recentApprovalLine?.work_order_id ? "item" : "filtered";

  const recentPartsRequest = partsQueryFailed
    ? null
    : (partsRows
        .filter((row) => !!row.work_order_id)
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime(),
        )[0] ?? null);
  const waitingPartsTargetHref = recentPartsRequest?.work_order_id
    ? `/work-orders/${recentPartsRequest.work_order_id}`
    : "/parts/requests";
  const waitingPartsTargetKind: "item" | "filtered" =
    recentPartsRequest?.work_order_id ? "item" : "filtered";

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
      label: isTechnicianScoped
        ? "My jobs with open parts"
        : "Jobs with open parts",
      value: String(payload.topSummary.waitingParts),
      tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
      href: waitingPartsTargetHref,
      targetKind: waitingPartsTargetKind,
    },
    {
      label: isTechnicianScoped
        ? "My blocked jobs (parts/on hold)"
        : "Blocked jobs (parts/on hold)",
      value: String(payload.topSummary.blockedJobs),
      tone: payload.topSummary.blockedJobs > 0 ? "accent" : "default",
      href: blockedTargetHref,
      targetKind: blockedTargetKind,
    },
  ];

  payload.topSummary.appointmentsToday = bookingsTodayResult.error ? 0 : (bookingsTodayResult.count ?? 0);
  payload.topSummary.techniciansClockedIn = clockedInResult.error ? 0 : (clockedInResult.count ?? 0);

  if (bookingsTodayResult.error) {
    console.error("[Dashboard][Operations] daily summary query failed", {
      shopId: identity.shopId,
      userId: identity.userId,
      error: bookingsTodayResult.error.message,
    });
    payload.sectionErrors.push(
      "Daily summary signal is temporarily unavailable.",
    );
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
          label: "My jobs with open parts",
          value: String(payload.topSummary.waitingParts),
          tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
          href: waitingPartsTargetHref,
          targetKind: waitingPartsTargetKind,
        },
        {
          label: "Today's bookings",
          value: String(bookingsTodayResult.count ?? 0),
        },
      ]
    : [
        {
          label: "Today's bookings",
          value: String(bookingsTodayResult.count ?? 0),
        },
        {
          label: "Approval queue",
          value: String(payload.topSummary.waitingApprovals),
          tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default",
          href: approvalTargetHref,
          targetKind: approvalTargetKind,
        },
        {
          label: "Jobs with open parts",
          value: String(payload.topSummary.waitingParts),
          tone: payload.topSummary.waitingParts > 0 ? "accent" : "default",
          href: waitingPartsTargetHref,
          targetKind: waitingPartsTargetKind,
        },
        { label: "Active board", value: String(payload.topSummary.activeJobs) },
      ];

  if (techProfilesResult.error || activeLinesResult.error) {
    payload.sectionErrors.push(
      "Technician activity section is degraded due to query failures.",
    );
  } else {
    const techs = techProfilesResult.data ?? [];
    const counts = new Map<
      string,
      { activeLines: number; latestStatus: string; lastUpdated: string | null }
    >();

    activeLines.forEach((line) => {
      if (!line.assigned_tech_id) return;
      const previous = counts.get(line.assigned_tech_id);
      counts.set(line.assigned_tech_id, {
        activeLines: (previous?.activeLines ?? 0) + 1,
        latestStatus: previous?.latestStatus ?? stageLabel(line.status),
        lastUpdated: previous?.lastUpdated ?? line.updated_at,
      });
    });

    const maxLines = Math.max(
      1,
      ...[...counts.values()].map((entry) => entry.activeLines),
    );
    const technicianRows = techs.map((tech) => {
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
      : technicianRows
          .sort((a, b) => b.activeLines - a.activeLines)
          .slice(0, 6);
  }

  payload.alerts = [
    payload.topSummary.blockedJobs > 0
      ? {
          label: isTechnicianScoped
            ? "My blocked jobs need action"
            : "Blocked jobs climbing",
          detail: isTechnicianScoped
            ? `${payload.topSummary.blockedJobs} of your assigned jobs are waiting parts or on hold.`
            : `${payload.topSummary.blockedJobs} jobs are currently waiting parts or on hold.`,
          tone: "critical",
          href: blockedTargetHref,
          targetKind: blockedTargetKind,
        }
      : {
          label: isTechnicianScoped
            ? "My blocker pressure stable"
            : "Blocker pressure stable",
          detail: isTechnicianScoped
            ? "None of your assigned jobs are currently blocked."
            : "No blocked stage spike detected.",
          tone: "info",
          href: "/work-orders/board?stage=on_hold",
          targetKind: "filtered",
        },
    payload.topSummary.waitingApprovals > 3
      ? {
          label: isTechnicianScoped
            ? "My approvals are aging"
            : "Approval queue aging",
          detail: isTechnicianScoped
            ? `${payload.topSummary.waitingApprovals} of your lines need approval follow-up.`
            : `${payload.topSummary.waitingApprovals} approvals need advisor follow-up.`,
          tone: "warning",
          href: approvalTargetHref,
          targetKind: approvalTargetKind,
        }
      : {
          label: isTechnicianScoped
            ? "My approval queue healthy"
            : "Approval queue healthy",
          detail: isTechnicianScoped
            ? "Your approval-dependent lines are below action threshold."
            : "Approval queue is below action threshold.",
          tone: "info",
          href: "/work-orders/board?stage=awaiting_approval",
          targetKind: "filtered",
        },
    payload.topSummary.waitingParts > 0
      ? {
          label: isTechnicianScoped
            ? "My parts constraints active"
            : "Parts constraints active",
          detail: isTechnicianScoped
            ? `${payload.topSummary.waitingParts} of your jobs still have unresolved parts work.`
            : `${payload.topSummary.waitingParts} jobs still have unresolved parts work.`,
          tone: "warning",
          href: waitingPartsTargetHref,
          targetKind: waitingPartsTargetKind,
        }
      : {
          label: isTechnicianScoped
            ? "No parts constraints on my work"
            : "No parts constraints",
          detail: isTechnicianScoped
            ? "Your assigned jobs currently have no open parts blockers."
            : "Parts flow is currently clear.",
          tone: "info",
          href: "/parts/requests",
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
              detail:
                "Review your assigned jobs and move the next line forward.",
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
          href: "/work-orders/board",
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
          href: "/work-orders/board",
          tone: "neutral",
          detail: "Review technician assignment and bay balancing.",
        },
      ];

  const waitingApprovalCard = {
    label: "Waiting for customer approval",
    value: String(payload.topSummary.waitingApprovals),
    tone: "accent" as const,
    href: approvalTargetHref,
    targetKind: approvalTargetKind,
  };
  const waitingPartsCard = {
    label: "Jobs with open parts",
    value: String(payload.topSummary.waitingParts),
    tone: "accent" as const,
    href: waitingPartsTargetHref,
    targetKind: waitingPartsTargetKind,
  };
  const onHoldCount = activeBoardRows.filter((row) => row.overall_stage === "on_hold").length;
  const waiterCount = activeBoardRows.filter((row) => Boolean(row.is_waiter)).length;
  const longRunningCount = activeBoardRows.filter((row) => (row.time_in_stage_seconds ?? 0) >= 4 * 60 * 60).length;
  const idleTechCount = Math.max(0, payload.topSummary.techniciansClockedIn - activeLines.length);

  payload.immediateAttention = [
    payload.topSummary.waitingApprovals > 0 ? waitingApprovalCard : null,
    payload.topSummary.waitingParts > 0 ? waitingPartsCard : null,
    onHoldCount > 0 ? { label: "Jobs on hold", value: String(onHoldCount), tone: "accent" as const, href: "/work-orders/board?stage=on_hold", targetKind: "filtered" as const } : null,
    idleTechCount > 0 ? { label: "Technician with no active job", value: String(idleTechCount), tone: "accent" as const, href: "/dashboard/workforce/attendance", targetKind: "filtered" as const } : null,
    longRunningCount > 0 ? { label: "Long-running active jobs", value: String(longRunningCount), tone: "accent" as const, href: "/work-orders/board?stage=in_progress", targetKind: "filtered" as const } : null,
    waiterCount > 0 ? { label: "Customers currently waiting", value: String(waiterCount), tone: "accent" as const, href: "/work-orders/board", targetKind: "filtered" as const } : null,
  ].filter(Boolean) as OpSignal[];

  payload.todayOperations = [
    { label: "Open work orders", value: String(payload.topSummary.activeJobs), href: "/work-orders/board" },
    { label: "Vehicles in shop", value: String(payload.topSummary.activeJobs), href: "/work-orders/board" },
    { label: "Technicians clocked in", value: String(payload.topSummary.techniciansClockedIn), href: "/dashboard/workforce/attendance" },
    { label: "Jobs currently active", value: String(activeLines.length), href: "/work-orders/board?stage=in_progress" },
    { label: "Appointments today", value: String(payload.topSummary.appointmentsToday), href: "/dashboard/bookings" },
    { label: "Completed today", value: String(payload.topSummary.completedToday), href: "/work-orders/board?stage=completed" },
  ];

  payload.quickActions = [
    { label: "Create Work Order", href: "/work-orders/create", tone: "primary" },
    { label: "Work Order Board", href: "/work-orders/board", tone: "neutral" },
    { label: "Attendance & Activity", href: "/dashboard/workforce/attendance", tone: "neutral" },
    { label: "Customers", href: "/customers", tone: "neutral" },
    { label: "Vehicles", href: "/vehicles", tone: "neutral" },
    { label: "Schedule", href: "/dashboard/bookings", tone: "neutral" },
  ];

  payload.recentOperationalActivity = payload.liveWork.slice(0, 5).map((item) => ({
    label: `${item.label} is ${item.stage}`,
    value: item.risk === "danger" ? "At risk" : "Updated",
    href: `/work-orders/${item.id}`,
  }));

  payload.fetchAudit.push(
    "Operations dashboard now renders from one server payload with composed panel data.",
  );

  return payload;
}
