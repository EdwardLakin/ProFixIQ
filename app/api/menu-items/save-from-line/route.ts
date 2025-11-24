// app/api/menu-items/save-from-line/route.ts
import "server-only";
import type { NextRequest } from "next/server";
import { POST as upsertFromLine } from "../upsert-from-line/route";

export const runtime = "nodejs";

// Re-export the same POST handler so both URLs behave identically.
export async function POST(req: NextRequest) {
  return upsertFromLine(req);
}