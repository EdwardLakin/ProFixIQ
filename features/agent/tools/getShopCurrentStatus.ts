import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";

type WorkOrderRef =
  | {
      id: string;
      custom_id: string | null;
      status: string | null;
    }
  | {
      id: string;
      custom_id: string | null;
      status: string | null;
    }[]
  | null;

type Row = {
  id: string;
  status: string | null;
  assigned_tech_id: string | null;
  description: string | null;
  complaint: string | null;
  updated_at: string | null;
  work_orders: WorkOrderRef;
};

type ActiveSegmentRow = {
  work_order_line_id: string | null;
  technician_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

function getWorkOrder(workOrder: WorkOrderRef) {
  return Array.isArray(workOrder) ? workOrder[0] ?? null : workOrder;
}

export async function runGetShopCurrentStatus(_: object, ctx: ToolContext) {
  const supabase = getServerSupabase();

  const [
    { data: lines, error: linesError },
    { data: profiles, error: profilesError },
    { data: activeSegments, error: activeSegmentsError },
  ] =
    await Promise.all([
      supabase
        .from("work_order_lines")
        .select(
          `
          id,
          status,
          assigned_tech_id,
          description,
          complaint,
          updated_at,
          work_orders:work_order_id (
            id,
            custom_id,
            status
          )
        `,
        )
        .eq("shop_id", ctx.shopId)
        .in("status", ["awaiting", "queued", "in_progress", "on_hold"])
        .order("updated_at", { ascending: false })
        .limit(100),

      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("shop_id", ctx.shopId),
      supabase
        .from("work_order_line_labor_segments")
        .select("work_order_line_id, technician_id")
        .eq("shop_id", ctx.shopId)
        .is("ended_at", null),
    ]);

  if (linesError) throw new Error(linesError.message);
  if (profilesError) throw new Error(profilesError.message);
  if (activeSegmentsError) throw new Error(activeSegmentsError.message);

  const rows = (lines ?? []) as unknown as Row[];
  const segments = (activeSegments ?? []) as ActiveSegmentRow[];
  const people = (profiles ?? []) as ProfileRow[];

  const profileMap = new Map<string, string>();
  for (const profile of people) {
    if (profile.id) {
      profileMap.set(profile.id, profile.full_name ?? profile.id);
    }
  }

  const activeTechByLineId = new Map<string, string[]>();
  for (const segment of segments) {
    if (!segment.work_order_line_id || !segment.technician_id) continue;
    const techs = activeTechByLineId.get(segment.work_order_line_id) ?? [];
    techs.push(segment.technician_id);
    activeTechByLineId.set(segment.work_order_line_id, techs);
  }

  const grouped = new Map<
    string,
    Array<{
      id: string;
      href: string;
      label: string;
    }>
  >();

  for (const row of rows) {
    const activeTechIds = activeTechByLineId.get(row.id) ?? [];
    const groupingTechIds = activeTechIds.length > 0 ? activeTechIds : [row.assigned_tech_id ?? "unassigned"];

    const wo = getWorkOrder(row.work_orders);
    const woId = wo?.id ?? row.id;
    const woLabel = wo?.custom_id ? `WO #${wo.custom_id}` : `WO ${woId.slice(0, 8)}`;

    const lineLabel =
      row.description ?? row.complaint ?? row.status ?? "Active job";

    for (const techId of groupingTechIds) {
      const techName =
        techId === "unassigned"
          ? "Unassigned"
          : profileMap.get(techId) ?? techId;

      if (!grouped.has(techName)) {
        grouped.set(techName, []);
      }

      grouped.get(techName)!.push({
        id: woId,
        href: techId !== "unassigned" ? `/work-orders/${woId}/focused-job/${row.id}` : `/work-orders/${woId}`,
        label: `${woLabel} • ${lineLabel}`,
      });
    }
  }

  const techSections = Array.from(grouped.entries()).map(([tech, jobs]) => ({
    tech,
    jobs,
  }));

  const summary =
    techSections.length === 0
      ? "No technicians are currently assigned active work."
      : techSections
          .map((section) => `${section.tech}: ${section.jobs.map((j) => j.label).join(", ")}`)
          .join(" | ");

  const citations = techSections.flatMap((section) =>
    section.jobs.map((job) => ({
      type: "work_order",
      id: job.id,
      href: job.href,
      label: `${section.tech} • ${job.label}`,
    })),
  );

  return {
    ok: true,
    summary,
    citations,
  };
}
