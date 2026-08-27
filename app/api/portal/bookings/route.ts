// app/api/portal/bookings/route.ts
import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  createPortalBooking,
  type CreatePortalBookingInput,
} from "@/features/portal/server/createPortalBooking";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  scheduler_event_id: string | null;
  scheduler_resource_id: string | null;
  scheduler_resource_name: string | null;
  scheduler_resource_type: string | null;
  service_mode: string | null;
};

type BookingRow = Db["public"]["Tables"]["bookings"]["Row"] & {
  customers?: Pick<
    Db["public"]["Tables"]["customers"]["Row"],
    "first_name" | "last_name" | "email" | "phone"
  > | null;
  shops?: Pick<Db["public"]["Tables"]["shops"]["Row"], "slug"> | null;
};

type SchedulerEvent = {
  id?: string | null;
  bookingId?: string | null;
  mode?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  resourceType?: string | null;
};

type RpcError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status });
}

function schedulerWindow(
  rows: BookingRow[],
): { start: string; end: string } | null {
  if (rows.length === 0) return null;
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const start = Date.parse(row.starts_at);
    const end = Date.parse(row.ends_at);
    if (Number.isFinite(start)) first = Math.min(first, start);
    if (Number.isFinite(end)) last = Math.max(last, end);
  }
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first)
    return null;
  return {
    start: new Date(first - 60_000).toISOString(),
    end: new Date(last + 60_000).toISOString(),
  };
}

async function loadSchedulerEvents(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  shopId: string,
  bookings: BookingRow[],
): Promise<Map<string, SchedulerEvent>> {
  const window = schedulerWindow(bookings);
  if (!window) return new Map();

  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    "scheduler_list_events",
    {
      p_shop_id: shopId,
      p_starts_at: window.start,
      p_ends_at: window.end,
      p_mode: null,
    },
  );
  if (error) {
    console.error("scheduler booking projection failed", error);
    return new Map();
  }

  const events = Array.isArray(data) ? (data as SchedulerEvent[]) : [];
  return new Map(
    events
      .filter((event) => typeof event.bookingId === "string")
      .map((event) => [String(event.bookingId), event]),
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const shopSlug = url.searchParams.get("shop") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const bookingId = url.searchParams.get("bookingId")?.trim() ?? "";
  const scope = url.searchParams.get("scope")?.trim() ?? "";
  const shopContextOnly = scope === "shop";
  const pendingQueue = status === "pending";

  if (scope && !shopContextOnly) {
    return bad("Unsupported scope");
  }
  if (bookingId && !UUID_PATTERN.test(bookingId)) {
    return bad("Invalid booking id");
  }
  if (
    !shopContextOnly &&
    (!shopSlug || (!bookingId && !pendingQueue && (!start || !end)))
  ) {
    return bad("Missing shop or date range");
  }

  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const { profile, supabase } = access;

  const actor = getActorCapabilities({ role: access.canonicalRole });
  if (bookingId && !actor.canManageScheduling) {
    return bad("Not allowed", 403);
  }
  if (
    !actor.isKnownRole ||
    (!actor.canManageScheduling && !actor.canViewShopWideData)
  ) {
    return bad("Not allowed", 403);
  }

  // The service client is used only after canonical staff authorization and is
  // pinned to the actor's resolved tenant. This keeps linked legacy profiles
  // working even where the shops self-read policy still keys on profiles.id.
  let shopQuery = createAdminSupabase()
    .from("shops")
    .select("id, name, slug, accepts_online_booking")
    .eq("id", profile.shop_id);

  if (!shopContextOnly) {
    shopQuery = shopQuery.eq("slug", shopSlug);
  }

  const { data: shop, error: shopErr } = await shopQuery.maybeSingle();
  if (shopErr || !shop) return bad("Shop not found", 404);

  if (shopContextOnly) {
    return NextResponse.json(
      { shop },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

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

  if (bookingId) {
    bookingsQuery = bookingsQuery.eq("id", bookingId).limit(1);
  } else if (pendingQueue) {
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

  if (bookingId && rows.length === 0) {
    return bad("Appointment not found", 404);
  }

  const bookings = rows as unknown as BookingRow[];
  const schedulerByBooking = await loadSchedulerEvents(
    supabase,
    shop.id,
    bookings,
  );

  const payload: BookingPayload[] = bookings.map((row) => {
    const customer = row.customers ?? null;
    const event = schedulerByBooking.get(row.id);
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
      scheduler_event_id: event?.id ?? null,
      scheduler_resource_id: event?.resourceId ?? null,
      scheduler_resource_name: event?.resourceName ?? null,
      scheduler_resource_type: event?.resourceType ?? null,
      service_mode: event?.mode ?? null,
    };
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
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
