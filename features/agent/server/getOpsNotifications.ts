import { getServerSupabase } from "./supabase";

export type OpsNotificationLevel = "info" | "warning" | "urgent";

export type OpsNotificationCode =
  | "quote_waiting"
  | "approval_waiting"
  | "work_order_on_hold_too_long"
  | "work_order_waiting_too_long"
  | "parts_waiting_too_long"
  | "invoice_unsent_too_long"
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

type BoardRow = {
  work_order_id: string;
  custom_id: string | null;
  display_name: string | null;
  overall_stage: string | null;
  time_in_stage_seconds: number | null;
};

type PortalInvoiceRow = {
  work_order_id: string | null;
  status: string | null;
  invoice_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const APPROVAL_WAITING_HOURS = 12;
const QUEUED_WAITING_HOURS = 24;
const ON_HOLD_LINE_HOURS = 24;
const PARTS_WAITING_HOURS = 48;
const UNSENT_INVOICE_HOURS = 48;

function ageHours(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function secondsToHours(seconds: number | null | undefined): number {
  const parsed = Number(seconds ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed / 3600;
}

function woLabel(customId: string | null, id: string): string {
  return customId ? `WO #${customId}` : `WO ${id.slice(0, 8)}`;
}

function isInvoiceReadyToSend(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .toLowerCase()
    .replaceAll(" ", "_");

  return (
    normalized === "ready_to_invoice" ||
    normalized === "completed" ||
    normalized === "invoiced"
  );
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
    .limit(120);

  if (woError) {
    throw new Error(woError.message);
  }

  const { data: boardRows, error: boardError } = await supabase
    .from("v_work_order_board_cards_shop")
    .select("work_order_id, custom_id, display_name, overall_stage, time_in_stage_seconds")
    .eq("shop_id", shopId)
    .in("overall_stage", ["awaiting_approval", "waiting_parts"])
    .order("time_in_stage_seconds", { ascending: false })
    .limit(120);

  if (boardError) {
    throw new Error(boardError.message);
  }

  const { data: heldLines, error: lineError } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, description, complaint, hold_reason, on_hold_since, updated_at",
    )
    .eq("shop_id", shopId)
    .eq("status", "on_hold")
    .order("updated_at", { ascending: true })
    .limit(150);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const { data: portalInvoices, error: invoiceError } = await supabase
    .from("v_portal_invoices")
    .select("work_order_id, status, invoice_sent_at, created_at, updated_at")
    .eq("shop_id", shopId)
    .is("invoice_sent_at", null)
    .order("updated_at", { ascending: true })
    .limit(120);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const woRows = (workOrders ?? []) as WorkOrderRow[];
  const lineRows = (heldLines ?? []) as WorkOrderLineRow[];
  const stageRows = (boardRows ?? []) as BoardRow[];
  const unsentInvoices = (portalInvoices ?? []) as PortalInvoiceRow[];

  const workOrderById = new Map<string, WorkOrderRow>();
  for (const row of woRows) {
    workOrderById.set(row.id, row);
  }

  const seenApprovalFromBoard = new Set<string>();

  for (const row of stageRows) {
    const stage = String(row.overall_stage ?? "").toLowerCase();
    const hours = secondsToHours(row.time_in_stage_seconds);

    if (stage === "awaiting_approval" && hours >= APPROVAL_WAITING_HOURS) {
      seenApprovalFromBoard.add(row.work_order_id);
      notifications.push({
        level: "warning",
        code: "approval_waiting",
        title: "Approval waiting too long",
        message: `${woLabel(row.custom_id, row.work_order_id)} has been waiting for approval for ${hours.toFixed(1)} hours.`,
        href: `/quote-review/${row.work_order_id}`,
        entityType: "work_order",
        entityId: row.work_order_id,
      });
      continue;
    }

    if (stage === "waiting_parts" && hours >= PARTS_WAITING_HOURS) {
      notifications.push({
        level: "warning",
        code: "parts_waiting_too_long",
        title: "Parts waiting too long",
        message: `${woLabel(row.custom_id, row.work_order_id)} has been waiting on parts for ${hours.toFixed(1)} hours.`,
        href: `/work-orders/${row.work_order_id}`,
        entityType: "work_order",
        entityId: row.work_order_id,
      });
    }
  }

  for (const row of woRows) {
    const hours = ageHours(row.updated_at);
    if (hours == null) continue;

    if (
      row.status === "awaiting_approval" &&
      hours >= APPROVAL_WAITING_HOURS &&
      !seenApprovalFromBoard.has(row.id)
    ) {
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

    if (row.status === "queued" && hours >= QUEUED_WAITING_HOURS) {
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

    if (row.status === "on_hold" && hours >= ON_HOLD_LINE_HOURS) {
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
    if (hours == null || hours < ON_HOLD_LINE_HOURS) continue;

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

  for (const invoice of unsentInvoices) {
    if (!isInvoiceReadyToSend(invoice.status)) continue;

    const since = invoice.updated_at ?? invoice.created_at;
    const hours = ageHours(since);
    if (hours == null || hours < UNSENT_INVOICE_HOURS) continue;

    notifications.push({
      level: "warning",
      code: "invoice_unsent_too_long",
      title: "Invoice unsent too long",
      message: `A ready invoice has remained unsent for ${hours.toFixed(1)} hours.`,
      href: invoice.work_order_id
        ? `/work-orders/${invoice.work_order_id}`
        : "/portal/invoices",
      entityType: "invoice",
      entityId: invoice.work_order_id ?? undefined,
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
