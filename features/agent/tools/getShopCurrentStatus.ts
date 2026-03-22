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

type ProfileRow = {
  id: string;
  full_name: string | null;
};

function getWorkOrder(workOrder: WorkOrderRef) {
  return Array.isArray(workOrder) ? workOrder[0] ?? null : workOrder;
}

export async function runGetShopCurrentStatus(_: {}, ctx: ToolContext) {
  const supabase = getServerSupabase();

  const [{ data: lines, error: linesError }, { data: profiles, error: profilesError }] =
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
    ]);

  if (linesError) throw new Error(linesError.message);
  if (profilesError) throw new Error(profilesError.message);

  const rows = (lines ?? []) as unknown as Row[];
  const people = (profiles ?? []) as ProfileRow[];

  const profileMap = new Map<string, string>();
  for (const profile of people) {
    if (profile.id) {
      profileMap.set(profile.id, profile.full_name ?? profile.id);
    }
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
    const techKey = row.assigned_tech_id ?? "unassigned";
    const techName =
      techKey === "unassigned"
        ? "Unassigned"
        : profileMap.get(techKey) ?? techKey;

    const wo = getWorkOrder(row.work_orders);
    const woId = wo?.id ?? row.id;
    const woLabel = wo?.custom_id ? `WO #${wo.custom_id}` : `WO ${woId.slice(0, 8)}`;

    const lineLabel =
      row.description ?? row.complaint ?? row.status ?? "Active job";

    if (!grouped.has(techName)) {
      grouped.set(techName, []);
    }

    grouped.get(techName)!.push({
      id: woId,
      href: row.assigned_tech_id
        ? `/work-orders/${woId}/focused-job/${row.id}`
        : `/work-orders/${woId}`,
      label: `${woLabel} • ${lineLabel}`,
    });
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
