import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const body = await req.json().catch(() => null);
  // TODO: send to parts / work_order_quote_lines / parts_quote_requests
  return NextResponse.json({ ok: true, lineId: params.lineId, body });
}
