import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const body = await req.json().catch(() => null);
  // TODO: mark inspection finished, write inspection_results + quote lines
  return NextResponse.json({ ok: true, lineId: params.lineId, body });
}
