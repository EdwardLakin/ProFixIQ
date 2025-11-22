// app/api/portal/bookings/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: Request): Promise<Response> {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const url = new URL(req.url);
  const shopSlug = url.searchParams.get("shop") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";

  if (!shopSlug || !start || !end) return bad("Missing shop, start, or end");

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return bad("Not authenticated", 401);

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id")
    .eq("slug", shopSlug)
    .single();

  if (shopErr || !shop) return bad("Shop not found", 404);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  const staffRoles = ["owner","admin","manager","advisor","mechanic","parts"] as const;
  const isStaff =
    !!profile?.role &&
    (staffRoles as readonly string[]).includes(profile.role) &&
    profile.shop_id === shop.id;

  let customerIdFilter: string | null = null;

  if (!isStaff) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCustomer = !!cust && cust.shop_id === shop.id;
    if (!isCustomer) return bad("Not allowed", 403);

    customerIdFilter = cust.id;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return bad("Invalid start/end dates");
  }

  const endExclusive = new Date(endDate);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const { data: bookingRows, error: bErr } = await supabase
    .from("bookings")
    .select("id, shop_id, customer_id, starts_at, ends_at, status, notes")
    .eq("shop_id", shop.id)
    .gte("starts_at", startDate.toISOString())
    .lt("starts_at", endExclusive.toISOString())
    .order("starts_at");

  if (bErr || !bookingRows) return bad("Failed to load bookings", 500);

  let filtered = bookingRows;
  if (customerIdFilter) {
    filtered = bookingRows.filter((b) => b.customer_id === customerIdFilter);
  }

  if (filtered.length === 0) return NextResponse.json([], { status: 200 });

  const customerIds = Array.from(
    new Set(filtered.map((b) => b.customer_id).filter(Boolean))
  ) as string[];

  let customerMap = new Map<string, any>();
  if (customerIds.length > 0) {
    const { data: custRows } = await supabase
      .from("customers")
      .select(
        "id, full_name, name, first_name, last_name, email, phone, mobile, contact_email"
      )
      .in("id", customerIds);

    if (custRows) {
      customerMap = new Map(custRows.map((c) => [c.id, c]));
    }
  }

  const result = filtered.map((b) => {
    const c = b.customer_id ? customerMap.get(b.customer_id) : null;

    const name =
      c?.full_name ||
      c?.name ||
      `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() ||
      null;

    const email = c?.email || c?.contact_email || null;
    const phone = c?.phone || c?.mobile || null;

    return {
      id: b.id,
      shop_slug: shopSlug,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      status: b.status,
      notes: b.notes,
      customer_id: b.customer_id,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
    };
  });

  return NextResponse.json(result, { status: 200 });
}
