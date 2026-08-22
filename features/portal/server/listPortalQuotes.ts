import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  isCustomerVisibleQuoteLine,
  isHiddenQuoteRevision,
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

type PortalQuoteWorkOrderRow = {
  id: string;
  vehicle_id: string | null;
  created_at: string | null;
  scheduled_at: string | null;
  invoice_sent_at: string | null;
  estimate_number: string | null;
  external_id: string | null;
  work_order_quote_lines: PortalQuoteLineRow[] | null;
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

export function buildPortalQuoteCards(
  workOrders: PortalQuoteWorkOrderRow[],
): PortalQuoteCard[] {
  return workOrders.flatMap<PortalQuoteCard>((workOrder) => {
    const quoteLines = linesVisibleOnQuoteList(workOrder);
    if (quoteLines.length === 0) return [];

    if (workOrder.estimate_number) {
      const sent = quoteLines.some((line) =>
        isCustomerVisibleQuoteLine(line as unknown as Record<string, unknown>),
      );
      const approvedCount = quoteLines.filter((line) =>
        Boolean(line.approved_at || line.work_order_line_id),
      ).length;
      const approved = approvedCount === quoteLines.length;
      const descriptions = quoteLines
        .map((line) => clean(line.description))
        .filter(Boolean);

      return [
        {
          key: `estimate:${workOrder.id}`,
          workOrderId: workOrder.id,
          title: workOrder.estimate_number,
          detail: `${quoteLines.length} repair ${quoteLines.length === 1 ? "line" : "lines"}${
            descriptions.length > 0
              ? ` • ${descriptions.slice(0, 2).join(", ")}`
              : ""
          }`,
          partsOnly: false,
          sent,
          approved,
          status: approved
            ? workOrder.scheduled_at
              ? "Appointment requested"
              : "Approved — book when ready"
            : approvedCount > 0
              ? "Partially approved"
              : sent
                ? "Ready for your review"
                : "Shop is preparing your estimate",
          aggregate: true,
        },
      ];
    }

    return quoteLines.map((line) => {
      const meta = metadata(line.metadata);
      const partsOnly = clean(meta.request_kind) === "parts_only";
      const sent = isCustomerVisibleQuoteLine(
        line as unknown as Record<string, unknown>,
      );
      const approved = Boolean(line.approved_at || line.work_order_line_id);
      return {
        key: `line:${line.id}`,
        workOrderId: workOrder.id,
        title: clean(line.description) || "Quote request",
        detail: partsOnly
          ? "Parts-only • Pickup"
          : "Repair quote • Appointment after approval",
        partsOnly,
        sent,
        approved,
        status: approved
          ? partsOnly
            ? "Approved for pickup order"
            : workOrder.scheduled_at
              ? "Appointment requested"
              : "Approved — book when ready"
          : sent
            ? "Ready for your review"
            : "Shop is preparing your quote",
        aggregate: false,
      };
    });
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
  const { data, error } = await supabase
    .from("work_orders")
    .select(
      "id,vehicle_id,created_at,scheduled_at,invoice_sent_at,estimate_number,external_id,work_order_quote_lines(id,description,status,stage,approved_at,declined_at,work_order_line_id,sent_to_customer_at,metadata)",
    )
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(200)
    .abortSignal(signal);

  if (error) throw new Error(error.message);
  return buildPortalQuoteCards(
    (data ?? []) as unknown as PortalQuoteWorkOrderRow[],
  );
}
