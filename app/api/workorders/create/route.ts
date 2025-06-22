import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for secure insert
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, appointment } = body;

    if (!items || !appointment) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // TODO: Replace this with real session auth lookup
    const userId = "mock-user-id";

    const { data, error } = await supabase
      .from("work_orders")
      .insert([
        {
          user_id: userId,
          items,
          appointment,
          status: "pending",
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, workOrder: data[0] });
  } catch (err) {
    console.error("Create work order error:", err);
    return NextResponse.json({ error: "Failed to create work order." }, { status: 500 });
  }
}