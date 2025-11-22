// app/api/portal/bookings/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type Db = Database;

// Shape we return to the client (matches Booking in /portal/appointments)
type BookingPayload = {
  id: string;
  shop_slug: string | null;
  starts_at: string;
  ends_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  notes: string | null;
  status: string | null;
};

type BookingRow =
  Db["public"]["Tables"]["bookings"]["Row"] & {
    customers?: {
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      contact_email?: string | null;
      phone?: string | null;
      mobile?: string | null;
    } | null;
    shops?: {
      slug?: string | null;
    } | null;
  };

function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: Request): Promise<Response> {
  const supabase = createRouteHandlerClient<Db>({ cookies });

  const url = new URL(req.url);
  const shopSlug = url.searchParams.get("shop") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";

  if (!shopSlug || !start || !end) {
    return bad("Missing shop, start, or end");
  }

  // Auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return bad("Not authenticated", 401);

  // Staff profile
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.shop_id) {
    return bad("Profile / shop not found", 403);
  }

  const staffRoles = [
    "owner",
    "admin",
    "manager",
    "advisor",
    "mechanic",
    "parts",
  ] as const;

  if (
    !profile.role ||
    !staffRoles.includes(profile.role as (typeof staffRoles)[number])
  ) {
    return bad("Not allowed", 403);
  }

  // Shop by slug
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id, slug")
    .eq("slug", shopSlug)
    .single();

  if (shopErr || !shop) return bad("Shop not found", 404);
  if (shop.id !== profile.shop_id) {
    return bad("You cannot view bookings for this shop", 403);
  }

  // Build date window for the week (inclusive)
  const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();
  const endDate = new Date(`${end}T00:00:00.000Z`);
  endDate.setDate(endDate.getDate() + 1); // next day
  const endIso = endDate.toISOString();

  // Query bookings + customer + shop slug
  const { data: rows, error: rowsErr } = await supabase
    .from("bookings")
    .select(
      `
        id,
        shop_id,
        customer_id,
        starts_at,
        ends_at,
        status,
        notes,
        customers:customer_id (
          full_name,
          first_name,
          last_name,
          email,
          contact_email,
          phone,
          mobile
        ),
        shops:shop_id (
          slug
        )
      `,
    )
    .eq("shop_id", shop.id)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at", { ascending: true });

  if (rowsErr || !rows) {
    return bad("Failed to load bookings", 500);
  }

  // Ensure we always have an array and safely assert to BookingRow[]
  const joinedRows: BookingRow[] = (Array.isArray(rows) ? rows : []) as unknown as BookingRow[];

  const payload: BookingPayload[] = joinedRows.map((row) => {
    const customer = row.customers ?? null;
    const shopRel = row.shops ?? null;

    const nameFromCustomer =
      customer?.full_name ??
      [customer?.first_name, customer?.last_name]
        .filter((part) => !!part && part.trim().length > 0)
        .join(" ")
        .trim();

    const emailFromCustomer =
      customer?.email ?? customer?.contact_email ?? null;

    const phoneFromCustomer =
      customer?.phone ?? customer?.mobile ?? null;

    return {
      id: row.id,
      shop_slug: shopRel?.slug ?? null,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      customer_id: row.customer_id ?? null,
      customer_name:
        nameFromCustomer && nameFromCustomer.length > 0
          ? nameFromCustomer
          : null,
      customer_email: emailFromCustomer,
      customer_phone: phoneFromCustomer,
      notes: row.notes ?? null,
      status: row.status ?? null,
    };
  });

  return NextResponse.json(payload);
}