import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";

import { getSessionFromStore } from "@/features/inspections/unified/data/sessionStore";
import { finishInspectionSessionUnified } from "@/features/inspections/unified/data/finishSession";

export async function POST(
  req: Request,
  context: { params: { lineId: string } }
) {
  const { lineId } = context.params;

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
      { status: 404 }
    );
  }

  await finishInspectionSessionUnified(session);

  return NextResponse.json({ ok: true, lineId });
}