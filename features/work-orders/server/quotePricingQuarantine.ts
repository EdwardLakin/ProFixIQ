import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  isQuoteCustomerPricingQuarantined,
  QUOTE_PRICING_QUARANTINED_MESSAGE,
} from "@/features/work-orders/lib/quotes/quotePricingQuarantine";
import { isHiddenQuoteLifecycleStatus } from "@/features/work-orders/lib/quotes/quoteLifecycleStatus";

type DB = Database;

type QuoteLineReference = {
  id: string;
  work_order_line_id: string | null;
  source_work_order_line_id: string | null;
  status: string | null;
  metadata: Json | null;
};

type WorkOrderLineReference = {
  id: string;
  source_row_id: string | null;
  external_id: string | null;
};

export type QuotePricingQuarantineCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "lookup_failed"
        | "quote_line_not_found"
        | "decision_ineligible"
        | "quarantined";
      error: string;
      quoteLineIds: string[];
    };

function uniqueIds(ids: string[] | undefined): string[] {
  return [
    ...new Set(
      (ids ?? [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function quoteLineIdFromExternalId(value: string | null): string | null {
  const prefix = "quote_line:";
  const externalId = value?.trim() ?? "";
  return externalId.startsWith(prefix)
    ? externalId.slice(prefix.length).trim() || null
    : null;
}

export async function checkQuotePricingQuarantine(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  quoteLineIds?: string[];
  workOrderLineIds?: string[];
  includeAllQuoteLines?: boolean;
  includeSentRemaining?: boolean;
  requireDecisionEligible?: boolean;
}): Promise<QuotePricingQuarantineCheck> {
  const quoteLineIds = uniqueIds(params.quoteLineIds);
  const workOrderLineIds = uniqueIds(params.workOrderLineIds);
  const shouldLoad =
    params.includeAllQuoteLines === true ||
    params.includeSentRemaining === true ||
    quoteLineIds.length > 0 ||
    workOrderLineIds.length > 0;

  if (!shouldLoad) return { ok: true };

  const { data: quoteLinesRaw, error: quoteLinesError } = await params.supabase
    .from("work_order_quote_lines")
    .select("id,work_order_line_id,source_work_order_line_id,status,metadata")
    .eq("shop_id", params.shopId)
    .eq("work_order_id", params.workOrderId);

  if (quoteLinesError) {
    return {
      ok: false,
      reason: "lookup_failed",
      error: "Unable to verify protected quote pricing.",
      quoteLineIds: [],
    };
  }

  const quoteLines = (quoteLinesRaw ?? []) as QuoteLineReference[];
  const quoteLinesById = new Map(quoteLines.map((line) => [line.id, line]));
  const missingQuoteLineIds = quoteLineIds.filter(
    (id) => !quoteLinesById.has(id),
  );
  if (missingQuoteLineIds.length > 0) {
    return {
      ok: false,
      reason: "quote_line_not_found",
      error: "One or more quote lines were not found for this work order.",
      quoteLineIds: [],
    };
  }

  let workOrderLines: WorkOrderLineReference[] = [];
  if (workOrderLineIds.length > 0) {
    const { data: workOrderLinesRaw, error: workOrderLinesError } =
      await params.supabase
        .from("work_order_lines")
        .select("id,source_row_id,external_id")
        .eq("shop_id", params.shopId)
        .eq("work_order_id", params.workOrderId)
        .in("id", workOrderLineIds);

    if (workOrderLinesError) {
      return {
        ok: false,
        reason: "lookup_failed",
        error: "Unable to verify protected quote pricing.",
        quoteLineIds: [],
      };
    }
    workOrderLines = (workOrderLinesRaw ?? []) as WorkOrderLineReference[];
  }

  const selectedQuoteLineIds = new Set(quoteLineIds);
  if (params.includeAllQuoteLines === true) {
    quoteLines.forEach((line) => selectedQuoteLineIds.add(line.id));
  }
  if (params.includeSentRemaining === true) {
    quoteLines.forEach((line) => {
      if ((line.status ?? "").trim().toLowerCase() === "sent") {
        selectedQuoteLineIds.add(line.id);
      }
    });
  }

  const selectedWorkOrderLineIds = new Set(workOrderLineIds);
  quoteLines.forEach((line) => {
    if (
      (line.work_order_line_id &&
        selectedWorkOrderLineIds.has(line.work_order_line_id)) ||
      (line.source_work_order_line_id &&
        selectedWorkOrderLineIds.has(line.source_work_order_line_id))
    ) {
      selectedQuoteLineIds.add(line.id);
    }
  });
  workOrderLines.forEach((line) => {
    const linkedQuoteLineIds = [
      line.source_row_id,
      quoteLineIdFromExternalId(line.external_id),
    ];
    linkedQuoteLineIds.forEach((quoteLineId) => {
      if (quoteLineId && quoteLinesById.has(quoteLineId)) {
        selectedQuoteLineIds.add(quoteLineId);
      }
    });
  });

  if (params.requireDecisionEligible === true) {
    const ineligibleQuoteLineIds = quoteLines
      .filter(
        (line) =>
          selectedQuoteLineIds.has(line.id) &&
          isHiddenQuoteLifecycleStatus(line.status),
      )
      .map((line) => line.id)
      .sort();
    if (ineligibleQuoteLineIds.length > 0) {
      return {
        ok: false,
        reason: "decision_ineligible",
        error:
          "Canceled, voided, rejected, or superseded quote lines cannot be changed.",
        quoteLineIds: ineligibleQuoteLineIds,
      };
    }
  }

  const quarantinedQuoteLineIds = quoteLines
    .filter(
      (line) =>
        selectedQuoteLineIds.has(line.id) &&
        isQuoteCustomerPricingQuarantined(line.metadata),
    )
    .map((line) => line.id)
    .sort();

  if (quarantinedQuoteLineIds.length > 0) {
    return {
      ok: false,
      reason: "quarantined",
      error: QUOTE_PRICING_QUARANTINED_MESSAGE,
      quoteLineIds: quarantinedQuoteLineIds,
    };
  }

  return { ok: true };
}
