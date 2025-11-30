// app/api/inspections/unified/session/[lineId]/quote/route.ts
import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { getSessionFromStore } from "@/features/inspections/unified/data/sessionStore";
import { inspectionToQuoteLinesUnified } from "@/features/inspections/unified/data/toQuoteLines";

/**
 * POST – derive quote lines from a unified inspection session.
 * Body (optional): { session?: InspectionSession }
 * If omitted, we pull from the in-memory store.
 */
export async function POST(req: Request, context: any) {
  const lineId: string | undefined = context?.params?.lineId;

  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "Missing lineId in route path" },
      { status: 400 },
    );
  }

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

  // Later we can POST these into work_order_quote_lines / parts flows.
  return NextResponse.json({ ok: true, lineId, quoteLines });
}