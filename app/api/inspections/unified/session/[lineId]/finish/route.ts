import { NextResponse } from "next/server";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { getSessionFromStore } from "@/features/inspections/unified/data/sessionStore";
import { finishInspectionSessionUnified } from "@/features/inspections/unified/data/finishSession";

/**
 * POST – mark unified session finished.
 * Reading `lineId` manually from req.url so we do NOT depend on Next.js
 * route context typing (which Vercel's build worker is rejecting).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);

  // path: /api/inspections/unified/session/[lineId]/finish
  // segments: ["api","inspections","unified","session","123","finish"]
  const segments = url.pathname.split("/").filter(Boolean);
  const sessionIndex = segments.indexOf("session");

  const lineId =
    sessionIndex !== -1 && segments.length > sessionIndex + 1
      ? segments[sessionIndex + 1]
      : null;

  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "Missing lineId in route path" },
      { status: 400 }
    );
  }

  // Try to read JSON body
  const body = (await req.json().catch(() => null)) as
    | { session?: InspectionSession }
    | null;

  let session = body?.session;

  // Fall back to local store
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