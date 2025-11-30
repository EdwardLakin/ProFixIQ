import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { getSessionFromStore } from "@/features/inspections/unified/data/sessionStore";
import { finishInspectionSessionUnified } from "@/features/inspections/unified/data/finishSession";

/**
 * POST – mark unified session finished.
 * Body (optional): { session?: InspectionSession }
 * If omitted, we pull from the in-memory store.
 */
export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
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

  await finishInspectionSessionUnified(session);

  return NextResponse.json({ ok: true, lineId });
}