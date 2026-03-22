import { getServerSupabase } from "./supabase";

export type OpsNotificationLevel = "info" | "warning" | "urgent";

export type OpsNotificationCode =
  | "quote_waiting"
  | "approval_waiting"
  | "work_order_on_hold_too_long"
  | "work_order_waiting_too_long"
  | "tech_overloaded";

export type OpsNotification = {
  level: OpsNotificationLevel;
  code: OpsNotificationCode;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
};

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type WorkOrderLineRow = {
  id: string;
  work_order_id: string | null;
  status: string | null;
  description: string | null;
  complaint: string | null;
  hold_reason: string | null;
  on_hold_since: string | null;
  updated_at: string | null;
};

function ageHours(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function woLabel(customId: string | null, id: string): string {
  return customId ? `WO #${customId}` : `WO ${id.slice(0, 8)}`;
}

export async function getOpsNotifications(
  shopId: string,
): Promise<OpsNotification[]> {
  const supabase = getServerSupabase();

  const notifications: OpsNotification[] = [];

  const { data: workOrders, error: woError } = await supabase
    .from("work_orders")
    .select("id, custom_id, status, created_at, updated_at")
    .eq("shop_id", shopId)
    .in("status", [
      "awaiting",
      "awaiting_approval",
      "queued",
      "on_hold",
      "planned",
      "in_progress",
    ])
    .order("updated_at", { ascending: true })
    .limit(100);

  if (woError) {
    throw new Error(woError.message);
  }

  const { data: heldLines, error: lineError } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, description, complaint, hold_reason, on_hold_since, updated_at",
    )
    .eq("shop_id", shopId)
    .eq("status", "on_hold")
    .order("updated_at", { ascending: true })
    .limit(100);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const woRows = (workOrders ?? []) as WorkOrderRow[];
  const lineRows = (heldLines ?? []) as WorkOrderLineRow[];

  const workOrderById = new Map<string, WorkOrderRow>();
  for (const row of woRows) {
    workOrderById.set(row.id, row);
  }

  for (const row of woRows) {
    const hours = ageHours(row.updated_at);
    if (hours == null) continue;

    if (row.status === "awaiting_approval" && hours >= 12) {
      notifications.push({
        level: "warning",
        code: "approval_waiting",
        title: "Approval waiting too long",
        message: `${woLabel(row.custom_id, row.id)} has been awaiting approval for ${hours.toFixed(1)} hours.`,
        href: `/quote-review/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
      continue;
    }

    if (row.status === "queued" && hours >= 24) {
      notifications.push({
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "Queued too long",
        message: `${woLabel(row.custom_id, row.id)} has been queued for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
      continue;
    }

    if (row.status === "awaiting" && hours >= 24) {
      notifications.push({
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "Awaiting too long",
        message: `${woLabel(row.custom_id, row.id)} has been awaiting action for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
      continue;
    }

    if (row.status === "in_progress" && hours >= 48) {
      notifications.push({
        level: "warning",
        code: "work_order_waiting_too_long",
        title: "In progress too long",
        message: `${woLabel(row.custom_id, row.id)} has been in progress for ${hours.toFixed(1)} hours without an update.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
      continue;
    }

    if (row.status === "on_hold" && hours >= 24) {
      notifications.push({
        level: "urgent",
        code: "work_order_on_hold_too_long",
        title: "Work order on hold too long",
        message: `${woLabel(row.custom_id, row.id)} has been on hold for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.id}`,
        entityType: "work_order",
        entityId: row.id,
        createdAt: row.updated_at ?? undefined,
      });
    }
  }

  for (const line of lineRows) {
    const since = line.on_hold_since ?? line.updated_at;
    const hours = ageHours(since);
    if (hours == null || hours < 24) continue;

    const workOrder = line.work_order_id
      ? workOrderById.get(line.work_order_id)
      : undefined;

    notifications.push({
      level: "urgent",
      code: "work_order_on_hold_too_long",
      title: "Held job line needs attention",
      message:
        `${workOrder ? woLabel(workOrder.custom_id, workOrder.id) : "Work order"}: ` +
        `${line.description ?? line.complaint ?? "Held line"} ` +
        `has been on hold for ${hours.toFixed(1)} hours` +
        `${line.hold_reason ? ` — ${line.hold_reason}` : ""}.`,
      href: line.work_order_id
        ? `/work-orders/${line.work_order_id}/focused-job/${line.id}`
        : undefined,
      entityType: "work_order_line",
      entityId: line.id,
      createdAt: since ?? undefined,
    });
  }

  notifications.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  return notifications;
}
