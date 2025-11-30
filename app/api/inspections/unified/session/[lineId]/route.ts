import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  getSessionFromStore,
  saveSessionToStore,
} from "@/features/inspections/unified/data/sessionStore";

/**
 * GET – load unified session for a work-order line.
 * Currently backed by the in-memory store.
 */
export async function GET(
  _req: Request,
  { params }: { params: { lineId: string } },
) {
  const { lineId } = params;

  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "Missing lineId in route path" },
      { status: 400 },
    );
  }

  const session = getSessionFromStore(lineId);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session not found", lineId },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, lineId, session });
}

/**
 * POST – persist unified session for a work-order line.
 * Body shape: { session: InspectionSession }
 */
export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const { lineId } = params;

  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "Missing lineId in route path" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { session?: InspectionSession }
    | null;

  if (!body?.session) {
    return NextResponse.json(
      { ok: false, error: "Missing session in body" },
      { status: 400 },
    );
  }

  const incoming = body.session;
  const id = incoming.id ?? lineId;

  const session: InspectionSession = {
    ...incoming,
    id,
    lastUpdated: new Date().toISOString(),
  };

  saveSessionToStore(lineId, session);

  return NextResponse.json({ ok: true, lineId, sessionId: id });
}