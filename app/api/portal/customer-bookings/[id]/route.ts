import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  status?: "cancelled";
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  const supabase = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.status !== "cancelled") {
    return NextResponse.json({ error: "Only cancellation is allowed" }, { status: 400 });
  }

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
  if (!customer?.id) return NextResponse.json({ error: "Customer profile not found" }, { status: 404 });

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("customer_id", customer.id)
    .select("id, starts_at, ends_at, notes, status")
    .maybeSingle();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  return NextResponse.json(updated);
}
