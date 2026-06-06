import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();

    const {
      inspectionId,
      workOrderId,
      sectionTitle,
      itemLabel,
      note,
      match,
      createdWorkOrderLineId,
      vehicle,
    } = await req.json();

    const vehicleYear =
      typeof vehicle?.year === "number"
        ? vehicle.year
        : Number(vehicle?.year ?? 0) || null;
    const vehicleMake =
      typeof vehicle?.make === "string" ? vehicle.make.trim() || null : null;
    const vehicleModel =
      typeof vehicle?.model === "string" ? vehicle.model.trim() || null : null;
    const engine =
      typeof vehicle?.engine === "string" ? vehicle.engine.trim() || null : null;
    const drivetrain =
      typeof vehicle?.drivetrain === "string"
        ? vehicle.drivetrain.trim() || null
        : null;
    const transmission =
      typeof vehicle?.transmission === "string"
        ? vehicle.transmission.trim() || null
        : null;

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
      vehicle_year: vehicleYear,
      vehicle_make: vehicleMake,
      vehicle_model: vehicleModel,
      engine,
      drivetrain,
      transmission,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to store smart match history" },
      { status: 500 },
    );
  }
}