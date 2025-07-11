import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      customer_id,
      vehicle_id,
      type,            // "diagnose", "inspection", or "maintenance"
      complaint,       // optional string
      appointment,     // optional ISO timestamp
    } = body;

    if (!customer_id || !vehicle_id || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("work_orders")
      .insert([
        {
          customer_id,
          vehicle_id,
          type,
          complaint: complaint || null,
          appointment: appointment || null,
          status: "queued",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, workOrder: data });
  } catch (err) {
    console.error("Error creating work order:", err);
    return NextResponse.json({ error: "Failed to create work order" }, { status: 500 });
  }
}