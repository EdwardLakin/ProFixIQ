// app/api/work-orders/update-status/list/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("work_orders")
      .select("*")
      .order("appointment", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ orders: data });
  } catch (err) {
    console.error("Error fetching work orders:", err);
    return NextResponse.json(
      { error: "Failed to fetch work orders." },
      { status: 500 },
    );
  }
}