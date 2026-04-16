import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function GET() {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
  if (!customer?.id) {
    return NextResponse.json({ error: "Customer profile not found" }, { status: 404 });
  }

  const { data: bookings, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, notes, status")
    .eq("customer_id", customer.id)
    .order("starts_at", { ascending: true });

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  return NextResponse.json(Array.isArray(bookings) ? bookings : []);
}
