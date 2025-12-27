// app/api/debug/sendgrid-test/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type DebugBody = {
  to?: string;
};

export async function POST(req: NextRequest) {
  let body: DebugBody | null = null;

  try {
    body = (await req.json()) as DebugBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: "Hit debug route successfully",
      received: body ?? null,
    },
    { status: 200 },
  );
}