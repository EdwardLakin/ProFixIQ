import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { lineId: string } },
) {
  // TODO: load from Supabase (inspection_sessions + templates)
  return NextResponse.json({ ok: true, lineId: params.lineId });
}

export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const body = await req.json().catch(() => null);
  // TODO: persist unified session state
  return NextResponse.json({ ok: true, lineId: params.lineId, body });
}
