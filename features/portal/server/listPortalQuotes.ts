import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  isCustomerVisibleDirectWorkOrderLine,
  isCustomerVisibleQuoteLine,
  isHiddenQuoteRevision,
  isPendingCustomerQuoteLine,
} from "@/features/portal/lib/quoteApprovalPresentation";

type DB = Database;

type PortalQuoteLineRow = {
  id: string;
  description: string | null;
  status: string | null;
  stage: string | null;
  approved_at: string | null;
  declined_at: string | null;
  work_order_line_id: string | null;
  sent_to_customer_at: string | null;
  metadata: unknown;
};

type PortalDirectWorkOrderLineRow = {
  id: string;
  description: string | null;
  status: string | null;
  line_status: string | null;
  approval_state: string | null;
  approval_at: string | null;
  quoted_at: string | null;
  voided_at: string | null;
};

type PortalQuoteWorkOrderRow = {
  id: string;
  vehicle_id: string | null;
  created_at: string | null;
  scheduled_at: string | null;
  invoice_sent_at: string | null;
  estimate_number: string | null;
  external_id: string | null;
  work_order_quote_lines: PortalQuoteLineRow[] | null;
  work_order_lines: PortalDirectWorkOrderLineRow[] | null;
};

export type PortalQuoteCard = {
  key: string;
  workOrderId: string;
  title: string;
  detail: string;
  partsOnly: boolean;
  sent: boolean;
  approved: boolean;
  status: string;
  aggregate: boolean;
};

const PAGE_SIZE = 200;
const MAX_QUOTE_CARDS = 200;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown): string {
  return clean(value).toLowerCase();
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPortalOriginQuote(workOrder: PortalQuoteWorkOrderRow): boolean {
  return clean(workOrder.external_id).startsWith("portal_quote:");
}

function linesVisibleOnQuoteList(
  workOrder: PortalQuoteWorkOrderRow,
): PortalQuoteLineRow[] {
  const lines = workOrder.work_order_quote_lines ?? [];
  if (isPortalOriginQuote(workOrder)) {
    return lines.filter(
      (line) =>
        !isHiddenQuoteRevision(line as unknown as Record<string, unknown>),
    );
  }
  return lines.filter((line) =>
    isCustomerVisibleQuoteLine(line as unknown as Record<string, unknown>),
  );
}

function directLinesVisibleOnQuoteList(
  workOrder: PortalQuoteWorkOrderRow,
  linkedWorkOrderLineIds: Set<string>,
): PortalDirectWorkOrderLineRow[] {
  return (workOrder.work_order_lines ?? []).filter(
    (line) =>
      !linkedWorkOrderLineIds.has(line.id) &&
      isCustomerVisibleDirectWorkOrderLine(
        line as unknown as Record<string, unknown>,
      ),
  );
}

function isApprovedQuoteLine(line: PortalQuoteLineRow): boolean {
  return Boolean(
    line.approved_at ||
    line.work_order_line_id ||
    ["approved", "converted"].includes(normalized(line.status)),
  );
}

function isApprovedDirectLine(line: PortalDirectWorkOrderLineRow): boolean {
  return Boolean(
    line.approval_at ||
    normalized(line.approval_state) === "approved" ||
    normalized(line.line_status) === "authorized" ||
    ["completed", "ready_to_invoice", "invoiced"].includes(
      normalized(line.status),
    ),
  );
}

function isPendingDirectLine(line: PortalDirectWorkOrderLineRow): boolean {
  return (
    normalized(line.approval_state) === "pending" &&
    normalized(line.status) === "awaiting_approval"
  );
}

function descriptionsFor(
  quoteLines: PortalQuoteLineRow[],
  directLines: PortalDirectWorkOrderLineRow[],
): string[] {
  return [...quoteLines, ...directLines]
    .map((line) => clean(line.description))
    .filter(Boolean);
}

function cardStatus(params: {
  approved: boolean;
  approvedCount: number;
  pending: boolean;
  sent: boolean;
  scheduled: boolean;
  partsOnly: boolean;
  quoteLines: PortalQuoteLineRow[];
  directLines: PortalDirectWorkOrderLineRow[];
}): string {
  if (params.approved) {
    if (params.partsOnly) return "Approved for pickup order";
    return params.scheduled
      ? "Appointment requested"
      : "Approved — book when ready";
  }
  if (params.approvedCount > 0) return "Partially approved";
  if (params.pending) return "Ready for your review";

  const states = [...params.quoteLines, ...params.directLines].map((line) =>
    normalized(
      "approval_state" in line && line.approval_state
        ? line.approval_state
        : line.status,
    ),
  );
  if (states.includes("deferred")) return "Deferred";
  if (states.includes("declined")) return "Declined";
  return params.sent ? "Decision recorded" : "Shop is preparing your quote";
}

export function buildPortalQuoteCards(
  workOrders: PortalQuoteWorkOrderRow[],
): PortalQuoteCard[] {
  return workOrders.flatMap<PortalQuoteCard>((workOrder) => {
    const quoteLines = linesVisibleOnQuoteList(workOrder);
    const linkedWorkOrderLineIds = new Set(
      quoteLines
        .map((line) => line.work_order_line_id)
        .filter((id): id is string => Boolean(id)),
    );
    const directLines = directLinesVisibleOnQuoteList(
      workOrder,
      linkedWorkOrderLineIds,
    );
    const lineCount = quoteLines.length + directLines.length;
    if (lineCount === 0) return [];

    const descriptions = descriptionsFor(quoteLines, directLines);
    const approvedCount =
      quoteLines.filter(isApprovedQuoteLine).length +
      directLines.filter(isApprovedDirectLine).length;
    const approved = approvedCount === lineCount;
    const pending =
      quoteLines.some((line) =>
        isPendingCustomerQuoteLine(line as unknown as Record<string, unknown>),
      ) || directLines.some(isPendingDirectLine);
    const sent =
      quoteLines.some((line) =>
        isCustomerVisibleQuoteLine(line as unknown as Record<string, unknown>),
      ) || directLines.length > 0;
    const partsOnly =
      directLines.length === 0 &&
      quoteLines.length > 0 &&
      quoteLines.every(
        (line) => clean(metadata(line.metadata).request_kind) === "parts_only",
      );
    const aggregate = Boolean(workOrder.estimate_number) || lineCount > 1;
    const title =
      clean(workOrder.estimate_number) ||
      (lineCount === 1
        ? descriptions[0] || "Quote request"
        : partsOnly
          ? "Parts quote"
          : "Repair quote");
    const detail = aggregate
      ? `${lineCount} repair ${lineCount === 1 ? "line" : "lines"}${
          descriptions.length > 0
            ? ` • ${descriptions.slice(0, 2).join(", ")}`
            : ""
        }`
      : partsOnly
        ? "Parts-only • Pickup"
        : "Repair quote • Appointment after approval";

    return [
      {
        key: `work-order:${workOrder.id}`,
        workOrderId: workOrder.id,
        title,
        detail,
        partsOnly,
        sent,
        approved,
        status: cardStatus({
          approved,
          approvedCount,
          pending,
          sent,
          scheduled: Boolean(workOrder.scheduled_at),
          partsOnly,
          quoteLines,
          directLines,
        }),
        aggregate,
      },
    ];
  });
}

export async function listPortalQuotesForCustomer({
  supabase,
  customerId,
  shopId,
  signal,
}: {
  supabase: SupabaseClient<DB>;
  customerId: string;
  shopId: string;
  signal: AbortSignal;
}): Promise<PortalQuoteCard[]> {
  const cards: PortalQuoteCard[] = [];
  let offset = 0;

  while (cards.length < MAX_QUOTE_CARDS) {
    const { data, error } = await supabase
      .from("work_orders")
      .select(
        "id,vehicle_id,created_at,scheduled_at,invoice_sent_at,estimate_number,external_id,work_order_quote_lines(id,description,status,stage,approved_at,declined_at,work_order_line_id,sent_to_customer_at,metadata),work_order_lines(id,description,status,line_status,approval_state,approval_at,quoted_at,voided_at)",
      )
      .eq("shop_id", shopId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .abortSignal(signal);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as PortalQuoteWorkOrderRow[];
    cards.push(...buildPortalQuoteCards(page));

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return cards.slice(0, MAX_QUOTE_CARDS);
}
