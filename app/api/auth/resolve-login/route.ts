export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has moved." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
