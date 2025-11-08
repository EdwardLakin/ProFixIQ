// app/api/openai/realtime-token/route.ts
import { NextResponse } from "next/server";

// super basic – in real life, scope it / check auth / make it short-lived
export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  // we just return it – your client will put it in the WS header
  return NextResponse.json({ apiKey });
}