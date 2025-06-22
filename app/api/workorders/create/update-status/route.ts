import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workOrderId, command } = body;

    if (!workOrderId || !command) {
      return NextResponse.json({ error: "Missing workOrderId or command" }, { status: 400 });
    }

    let updateFields: any = {};

    if (command === "punch-in") {
      updateFields = { status: "in_progress", started_at: new Date().toISOString() };
    } else if (command === "complete") {
      updateFields = { status: "completed", completed_at: new Date().toISOString() };
    } else {
      return NextResponse.json({ error: "Unknown command" }, { status: 400 });
    }

    const { error } = await supabase
      .from("work_orders")
      .update(updateFields)
      .eq("id", workOrderId);

    if (error) throw error;

    return NextResponse.json({ success: true, updated: updateFields });
  } catch (err) {
    console.error("Work order update failed:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}