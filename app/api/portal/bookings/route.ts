// app/api/portal/bookings/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  createPortalBooking,
  type CreatePortalBookingInput,
} from "@/features/portal/server/createPortalBooking";

export const runtime = "nodejs";

type Db = Database;
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
  vehicle_id: string | null;
  work_order_id: string | null;
};

type BookingRow = Db["public"]["Tables"]["bookings"]["Row"] & {
  customers?: Pick<
    Db["public"]["Tables"]["customers"]["Row"],
    "first_name" | "last_name" | "email" | "phone"
  > | null;
  shops?: Pick<Db["public"]["Tables"]["shops"]["Row"], "slug"> | null;
};

function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: Request): Promise<Response> {
  const supabase = createServerSupabaseRoute();
  const url = new URL(req.url);
  const shopSlug = url.searchParams.get("shop") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const pendingQueue = status === "pending";

  if (!shopSlug || (!pendingQueue && (!start || !end))) {
    return bad("Missing shop or date range");
  }

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return bad("Not authenticated", 401);

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .single();
  if (profErr || !profile?.shop_id) return bad("Profile / shop not found", 403);

  const actor = getActorCapabilities({ role: profile.role });
  if (
    !actor.isKnownRole ||
    (!actor.canManageScheduling && !actor.canViewShopWideData)
  ) {
    return bad("Not allowed", 403);
  }

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id, slug")
    .eq("slug", shopSlug)
    .single();
  if (shopErr || !shop) return bad("Shop not found", 404);
  if (shop.id !== profile.shop_id)
    return bad("You cannot view bookings for this shop", 403);

  let bookingsQuery = supabase
    .from("bookings")
    .select(
      `
      id, shop_id, customer_id, vehicle_id, work_order_id,
      starts_at, ends_at, status, notes,
      customers:customer_id (first_name, last_name, email, phone),
      shops:shop_id (slug)
    `,
    )
    .eq("shop_id", shop.id)
    .order("starts_at", { ascending: true });

  if (pendingQueue) {
    bookingsQuery = bookingsQuery.eq("status", "pending");
  } else {
    const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();
    const endDate = new Date(`${end}T00:00:00.000Z`);
    endDate.setDate(endDate.getDate() + 1);
    const endIso = endDate.toISOString();
    bookingsQuery = bookingsQuery
      .gte("starts_at", startIso)
      .lt("starts_at", endIso);
  }

  const { data: rows, error: rowsErr } = await bookingsQuery;

  if (rowsErr || !rows) {
    console.error("appointments GET failed", {
      shopId: shop.id,
      pendingQueue,
      message: rowsErr?.message,
      code: rowsErr?.code,
    });
    return bad(rowsErr?.message || "Failed to load bookings", 500);
  }

  const bookings = rows as unknown as BookingRow[];

  const payload: BookingPayload[] = bookings.map((row) => {
    const customer = row.customers ?? null;
    return {
      id: row.id,
      shop_slug: row.shops?.slug ?? null,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      customer_id: row.customer_id ?? null,
      customer_name:
        [customer?.first_name, customer?.last_name]
          .filter((part) => !!part && part.trim().length > 0)
          .join(" ") || null,
      customer_email: customer?.email ?? null,
      customer_phone: customer?.phone ?? null,
      notes: row.notes ?? null,
      status: row.status ?? null,
      vehicle_id: row.vehicle_id ?? null,
      work_order_id: row.work_order_id ?? null,
    };
  });

  return NextResponse.json(payload);
}

export async function POST(req: Request): Promise<Response> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return bad("Not authenticated", 401);

  const body = (await req
    .json()
    .catch(() => null)) as CreatePortalBookingInput | null;
  if (!body) return bad("Invalid JSON body", 400);
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    body.operationKey?.trim() ||
    body.idempotencyKey?.trim() ||
    "";
  if (!operationKey) return bad("A stable Idempotency-Key is required", 400);

  const result = await createPortalBooking({
    supabase,
    userId: user.id,
    input: { ...body, operationKey },
    actorMode: "customer-only",
  });
  if (!result.ok) return bad(result.error, result.status);

  return NextResponse.json(
    {
      booking: {
        id: result.booking.id,
        starts_at: result.booking.starts_at,
        ends_at: result.booking.ends_at,
        status: result.booking.status,
      },
    },
    { status: 201 },
  );
}
