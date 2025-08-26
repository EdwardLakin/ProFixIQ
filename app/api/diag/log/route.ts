import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, extra } = await req.json();
    // These console logs show up in Vercel “Logs”
    /* eslint-disable no-console */
    console.log("[diag]", message, extra ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[diag] failed to log", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}