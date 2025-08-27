import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("[diag]", body.message, body.extra || "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[diag] failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}