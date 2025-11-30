import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { getSessionFromStore } from "@/features/inspections/unified/data/sessionStore";
import { inspectionToQuoteLinesUnified } from "@/features/inspections/unified/data/toQuoteLines";

type RouteParams = {
  params: { lineId: string };
};

/**
 * POST – convert a unified session to quote lines.
 * Body (optional): { session?: InspectionSession }
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { lineId } = params;

  const body = (await req.json().catch(() => null)) as
    | { session?: InspectionSession }
    | null;

  let session = body?.session;

  if (!session) {
    session = getSessionFromStore(lineId) ?? undefined;
  }

  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session not found", lineId },
      { status: 404 },
    );
  }

  const quoteLines = inspectionToQuoteLinesUnified(session);

  // Later: push into work_order_quote_lines / parts_quote_requests.
  return NextResponse.json({ ok: true, lineId, quoteLines });
}
