import { createDashboardServerClient, getDashboardIdentity } from "@/features/dashboard/server/dashboard-shell-data";

const CLOSED_PART_STATUSES = ["fulfilled", "rejected", "cancelled"] as const;

type OpSignal = { label: string; value: string; tone?: "default" | "accent" };

type OpAction = { label: string; href: string; tone?: "primary" | "neutral" };

export type OperationsDashboardPayload = {
  identity: Awaited<ReturnType<typeof getDashboardIdentity>>;
  topSummary: {
    activeJobs: number;
    blockedJobs: number;
    waitingApprovals: number;
    waitingParts: number;
  };
  liveWork: Array<{
    id: string;
    label: string;
    stage: string;
    risk: string;
    priority: number;
  }>;
  technicianFlow: OpSignal[];
  blockerStack: OpSignal[];
  suggestedActions: OpAction[];
  sectionErrors: string[];
  fetchAudit: string[];
};

function stageLabel(stage: string | null | undefined): string {
  return (stage ?? "in_progress").replaceAll("_", " ");
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
    liveWork: [],
    technicianFlow: [],
    blockerStack: [],
    suggestedActions: [],
    sectionErrors: [],
    fetchAudit: [],
  };

  if (!identity.shopId) {
    payload.sectionErrors.push("No shop context found for this user.");
    return payload;
  }

  const supabase = createDashboardServerClient();

  const [boardResult, approvalsResult, partsResult, techProfilesResult, activeLinesResult] = await Promise.all([
    supabase
      .from("v_work_order_board_cards_shop")
      .select("work_order_id,custom_id,display_name,overall_stage,risk_level,priority")
      .eq("shop_id", identity.shopId)
      .order("activity_at", { ascending: false })
      .limit(14),
    supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", identity.shopId)
      .in("approval_state", ["requested", "pending", "awaiting_approval"]),
    supabase
      .from("part_requests")
      .select("id,status", { count: "exact" })
      .eq("shop_id", identity.shopId)
      .not("status", "in", `(${CLOSED_PART_STATUSES.map((status) => `'${status}'`).join(",")})`)
      .limit(80),
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("shop_id", identity.shopId)
      .in("role", ["tech", "mechanic", "technician"]),
    supabase
      .from("work_order_lines")
      .select("assigned_tech_id,status")
      .eq("shop_id", identity.shopId)
      .not("status", "in", "('completed','ready_to_invoice','invoiced')")
      .not("assigned_tech_id", "is", null)
      .limit(200),
  ]);

  if (boardResult.error) {
    payload.sectionErrors.push(`Live work section: ${boardResult.error.message}`);
  } else {
    const rows = boardResult.data ?? [];
    const blocked = rows.filter(
      (row) => row.overall_stage === "waiting_parts" || row.overall_stage === "on_hold",
    ).length;

    payload.topSummary.activeJobs = rows.filter((row) => row.overall_stage !== "completed").length;
    payload.topSummary.blockedJobs = blocked;
    payload.liveWork = rows.slice(0, 8).map((row) => ({
      id: row.work_order_id,
      label: row.custom_id ?? row.display_name ?? row.work_order_id.slice(0, 8),
      stage: stageLabel(row.overall_stage),
      risk: row.risk_level ?? "none",
      priority: row.priority ?? 3,
    }));

    payload.fetchAudit.push("Consolidated work-order board query now powers active jobs, live queue, and blocker counts.");
  }

  if (approvalsResult.error) {
    payload.sectionErrors.push(`Approvals section: ${approvalsResult.error.message}`);
  } else {
    payload.topSummary.waitingApprovals = approvalsResult.count ?? 0;
  }

  if (partsResult.error) {
    payload.sectionErrors.push(`Parts blocker section: ${partsResult.error.message}`);
  } else {
    const pendingParts = partsResult.data ?? [];
    payload.topSummary.waitingParts = partsResult.count ?? pendingParts.length;
    payload.blockerStack.push({ label: "Approvals pending", value: String(payload.topSummary.waitingApprovals), tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default" });
    payload.blockerStack.push({ label: "Waiting parts", value: String(payload.topSummary.waitingParts), tone: payload.topSummary.waitingParts > 0 ? "accent" : "default" });
    payload.blockerStack.push({ label: "On hold / blocked", value: String(payload.topSummary.blockedJobs), tone: payload.topSummary.blockedJobs > 0 ? "accent" : "default" });
  }

  if (techProfilesResult.error || activeLinesResult.error) {
    payload.sectionErrors.push("Technician flow section is degraded due to query failures.");
  } else {
    const techs = techProfilesResult.data ?? [];
    const activeLines = activeLinesResult.data ?? [];
    const counts = new Map<string, number>();
    activeLines.forEach((line) => {
      if (!line.assigned_tech_id) return;
      counts.set(line.assigned_tech_id, (counts.get(line.assigned_tech_id) ?? 0) + 1);
    });

    payload.technicianFlow = techs
      .map((tech) => ({
        label: tech.full_name ?? "Unassigned tech",
        value: `${counts.get(tech.id) ?? 0} active lines`,
      }))
      .sort((a, b) => Number.parseInt(b.value, 10) - Number.parseInt(a.value, 10))
      .slice(0, 5);
  }

  payload.suggestedActions = [
    payload.topSummary.waitingApprovals > 0
      ? { label: "Clear approval queue", href: "/work-orders/board?stage=awaiting_approval", tone: "primary" }
      : { label: "Review active board", href: "/work-orders/board", tone: "neutral" },
    payload.topSummary.waitingParts > 0
      ? { label: "Resolve waiting parts", href: "/dashboard/operations?focus=parts", tone: "primary" }
      : { label: "Create work order", href: "/work-orders/create", tone: "neutral" },
    { label: "Open dispatch view", href: "/dashboard/manager/dispatch", tone: "neutral" },
  ];

  if (payload.sectionErrors.length === 0) {
    payload.fetchAudit.push("No per-widget client bootstrap fetches remain on first paint for operations.");
  }

  return payload;
}
