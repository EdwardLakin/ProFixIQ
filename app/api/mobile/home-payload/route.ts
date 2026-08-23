import { NextResponse } from "next/server";
import { getMobileHomePayload } from "@/features/mobile/dashboard/server/getMobileHomePayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getMobileHomePayload();
    return NextResponse.json(
      { ok: true, payload },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[mobile/home-payload] load failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { ok: false, error: "Mobile dashboard counts could not be loaded." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
