// features/inspections/unified/data/finishSession.ts
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { inspectionToQuoteLinesUnified } from "./toQuoteLines";

export async function finishInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  const quoteLines = inspectionToQuoteLinesUnified(session);

  // For now, just log – later we can persist to Supabase + work_order_lines.
  // eslint-disable-next-line no-console
  console.debug("finishInspectionSessionUnified", {
    sessionId: session.id,
    workOrderId: session.workOrderId,
    quoteLinesCount: quoteLines.length,
  });
}