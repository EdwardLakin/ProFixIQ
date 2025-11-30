import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  getSessionFromStore,
  saveSessionToStore,
} from "@/features/inspections/unified/data/sessionStore";

/**
 * Extract lineId from the URL path manually.
 * Works on Vercel and avoids RouteContext typing issues.
 */
function extractLineId(req: Request): string | null {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);

  // e.g. ["api","inspections","unified","session","123"]
  const idx = segments.indexOf("session");

  if (idx !== -1 && segments.length > idx + 1) {
    return segments[idx + 1];
  }

  return null;
}

/**
 * GET – load unified session for a work-order line.
 */
export async function GET(req: Request) {
  const lineId = extractLineId(req);

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
 * Body: { session: InspectionSession }
 */
export async function POST(req: Request) {
  const lineId = extractLineId(req);

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