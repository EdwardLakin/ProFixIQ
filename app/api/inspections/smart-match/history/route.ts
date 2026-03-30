import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    const {
      inspectionId,
      workOrderId,
      sectionTitle,
      itemLabel,
      note,
      match,
      createdWorkOrderLineId,
    } = await req.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🔐 get shop_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id) {
      return NextResponse.json({ error: "No shop" }, { status: 400 });
    }

    await supabase.from("inspection_smart_match_history").insert({
      shop_id: profile.shop_id,
      inspection_id: inspectionId,
      work_order_id: workOrderId,
      section_title: sectionTitle,
      item_label: itemLabel,
      note,
      matched_label: match.label,
      correction: match.correction ?? null,
      labor_hours: match.laborHours ?? null,
      parts: match.parts ?? [],
      confidence: match.confidence ?? null,
      menu_repair_item_id: match.menuRepairItemId ?? null,
      created_work_order_line_id: createdWorkOrderLineId ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to store smart match history" },
      { status: 500 },
    );
  }
}