export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { consumePart } from "@work-orders/lib/parts/consumePart";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { work_order_line_id, part_id, qty, location_id } = body ?? {};

    if (
      typeof work_order_line_id !== "string" ||
      typeof part_id !== "string" ||
      typeof qty !== "number" ||
      qty <= 0
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const result = await consumePart({
      work_order_line_id,
      part_id,
      qty,
      location_id,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    // full error to function logs; short message to client
    console.error("❌ /api/parts/consume:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to consume part" },
      { status: 500 },
    );
  }
}

