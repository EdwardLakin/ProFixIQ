import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";

export async function runGetStalledWorkOrders(_: object, ctx: ToolContext) {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, created_at, updated_at")
    .eq("shop_id", ctx.shopId)
    .in("status", ["awaiting", "awaiting_approval", "queued", "on_hold", "planned", "in_progress"])
    .order("updated_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    custom_id: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;

  const now = Date.now();
  const stale = rows.filter((row) => {
    const t = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    if (!t) return false;
    const hours = (now - t) / (1000 * 60 * 60);
    if (row.status === "on_hold") return hours >= 24;
    if (row.status === "awaiting_approval") return hours >= 12;
    return hours >= 24;
  });

  if (stale.length === 0) {
    return {
      ok: true,
      summary: "I did not find any stale work orders using the current thresholds.",
      citations: [],
      notifications: [],
    };
  }

  return {
    ok: true,
    summary: `I found ${stale.length} stale work order(s) that have been in their current state too long.`,
    citations: stale.map((row) => ({
      type: "work_order",
      id: row.id,
      href: row.status === "awaiting_approval" ? `/quote-review/${row.id}` : `/work-orders/${row.id}`,
      label: `${row.custom_id ? `WO #${row.custom_id}` : `WO ${row.id.slice(0, 8)}`} • ${row.status ?? "unknown"}`,
    })),
    notifications: stale.map((row) => ({
      level: row.status === "awaiting_approval" ? "warning" as const : "urgent" as const,
      code:
        row.status === "awaiting_approval"
          ? "approval_waiting"
          : "work_order_waiting_too_long",
      title:
        row.status === "awaiting_approval"
          ? "Approval waiting too long"
          : "Work order stale",
      message:
        `${row.custom_id ? `WO #${row.custom_id}` : "Work order"} has been ${row.status ?? "active"} since ${row.updated_at ?? "unknown time"}.`,
      href: row.status === "awaiting_approval" ? `/quote-review/${row.id}` : `/work-orders/${row.id}`,
      entityType: "work_order",
      entityId: row.id,
    })),
  };
}
