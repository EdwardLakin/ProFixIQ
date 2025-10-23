// app/api/parts/consume/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePart } from "@work-orders/lib/parts/consumePart";

// Strict payload schema (no anys)
const Payload = z.object({
  work_order_line_id: z.string().min(1),
  part_id: z.string().min(1),
  qty: z.number().positive(),
  location_id: z.string().min(1).optional(),
});

type Payload = z.infer<typeof Payload>;

export async function POST(req: NextRequest) {
  try {
    const json: unknown = await req.json();
    const parsed = Payload.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body: Payload = parsed.data;

    const result = await consumePart({
      work_order_line_id: body.work_order_line_id,
      part_id: body.part_id,
      qty: body.qty,
      location_id: body.location_id,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to consume part";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


