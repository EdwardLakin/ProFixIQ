import { NextResponse } from "next/server";
import { getMobileHomePayload } from "@/features/mobile/dashboard/server/getMobileHomePayload";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await getMobileHomePayload();
    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load mobile dashboard payload";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
