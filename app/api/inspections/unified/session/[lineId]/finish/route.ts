import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { getSessionFromStore } from "@/features/inspections/unified/data/sessionStore";
import { finishInspectionSessionUnified } from "@/features/inspections/unified/data/finishSession";

/**
 * POST – mark unified session finished.
 * Body (optional): { session?: InspectionSession }
 * If omitted, we pull from the in-memory store keyed by lineId.
 *
 * NOTE: We intentionally take only (req) and read lineId from the URL
 * to avoid Next 15's strict context typing errors.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // expected: .../inspections/unified/session/[lineId]/finish
  const sessionIdx = segments.lastIndexOf("session");
  const lineId =
    sessionIdx !== -1 && segments.length > sessionIdx + 1
      ? segments[sessionIdx + 1]
      : "";

  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "Missing lineId in path" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { session?: InspectionSession }
    | null;

  let session = body?.session;

  // If caller didn't send a session, fall back to our in-memory store.
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