// app/api/parts/consume/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ensureMainLocation } from "@/features/parts/lib/locations";

type DB = Database;

const BodySchema = z.object({
  work_order_line_id: z.string().uuid("work_order_line_id must be a UUID"),
  part_id: z.string().uuid("part_id must be a UUID"),
  qty: z.number().positive("qty must be > 0"),
  location_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) Validate body (no `any`)
  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    // 2) Look up WO + shop_id via the line
    const { data: line, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, work_orders!inner(id, shop_id)")
      .eq("id", body.work_order_line_id)
      .single();
    if (lineErr) throw lineErr;

    const workOrderId = line.work_order_id as string;
    const shopId = (line as unknown as { work_orders: { shop_id: string } }).work_orders.shop_id;

    // 3) Decide location (default MAIN)
    let locationId = body.location_id;
    if (!locationId) {
      const main = await ensureMainLocation(shopId);
      locationId = main.id as string;
    }

    // 4) Optional audit: unit cost from part
    const { data: partRow, error: partErr } = await supabase
      .from("parts")
      .select("default_cost")
      .eq("id", body.part_id)
      .single();
    if (partErr) throw partErr;
    const unit_cost = Number(partRow?.default_cost ?? 0);

    // 5) Create allocation first (without stock_move_id)
    const { data: alloc, error: allocErr } = await supabase
      .from("work_order_part_allocations")
      .insert({
        work_order_line_id: body.work_order_line_id,
        part_id: body.part_id,
        location_id: locationId,
        qty: Math.abs(body.qty),
        unit_cost,
      })
      .select("id")
      .single();
    if (allocErr) throw allocErr;

    // 6) Apply stock move (consume = negative)
    const { data: moveId, error: moveErr } = await supabase.rpc("apply_stock_move", {
      p_part: body.part_id,
      p_loc: locationId,
      p_qty: -Math.abs(body.qty),
      p_reason: "consume", // enum in DB
      p_ref_kind: "WO",
      p_ref_id: workOrderId,
    });
    if (moveErr) throw moveErr;

    // 7) Link move → allocation
    const { error: linkErr } = await supabase
      .from("work_order_part_allocations")
      .update({ stock_move_id: moveId as string })
      .eq("id", alloc.id);
    if (linkErr) throw linkErr;

    return NextResponse.json(
      { allocationId: alloc.id as string, moveId: moveId as string },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to consume part";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
