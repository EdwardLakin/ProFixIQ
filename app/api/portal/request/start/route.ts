// app/api/portal/request/start/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";

export const runtime = "nodejs";

type Body = {
  vehicleId?: string | null;
  visitType: "waiter" | "drop_off";
  notes?: string | null;
  startsAt?: string | null;
  durationMins?: number | null;
  idempotencyKey?: string | null;
  quoteLineId?: string | null;
};

type StartRpcRow = {
  work_order_id: string;
  booking_id: string;
  deduped: boolean;
};

type QuoteBookingRpcResult = {
  ok?: boolean;
  workOrderId?: string;
  bookingId?: string;
  idempotent?: boolean;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function isIsoDateString(s: string) {
  return Number.isFinite(Date.parse(s));
}

function addMinsIso(startIso: string, mins: number): string {
  const d = new Date(startIso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function normalizeIdempotencyKey(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().toLowerCase().slice(0, 120);
}

function isDuplicateKeyError(
  err: { code?: string | null; message?: string | null } | null,
): boolean {
  return (
    err?.code === "23505" ||
    (err?.message ?? "").toLowerCase().includes("duplicate key")
  );
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const actor = await requirePortalCustomerActor(supabase);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Invalid JSON body");
    }

    const visitType = body?.visitType;
    if (visitType !== "waiter" && visitType !== "drop_off") {
      return bad("visitType must be 'waiter' or 'drop_off'");
    }

    const startsAtRaw =
      typeof body.startsAt === "string" ? body.startsAt.trim() : "";
    if (!startsAtRaw) return bad("Missing startsAt (ISO) from selected slot.");
    if (!isIsoDateString(startsAtRaw)) {
      return bad("startsAt must be a valid ISO date string.");
    }

    const duration =
      typeof body.durationMins === "number" && Number.isFinite(body.durationMins)
        ? Math.max(15, Math.min(180, Math.trunc(body.durationMins)))
        : 60;

    const startsAtDate = new Date(startsAtRaw);
    if (Number.isNaN(startsAtDate.getTime())) return bad("Invalid startsAt");
    if (startsAtDate.getTime() < Date.now() - 60_000) {
      return bad("Selected time is in the past. Please choose another slot.");
    }

    const startsAt = startsAtDate.toISOString();
    const endsAt = addMinsIso(startsAt, duration);

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("id", actor.customer.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);
    if (!customer.shop_id) return bad("Customer is not linked to a shop", 400);

    const normalizedKey = normalizeIdempotencyKey(
      req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? null,
    );
    if (!normalizedKey) {
      return bad("A stable Idempotency-Key is required.");
    }

    const vehicleId =
      typeof body.vehicleId === "string" && body.vehicleId.trim()
        ? body.vehicleId.trim()
        : null;
    if (vehicleId) {
      const { data: vehicle, error: vehicleErr } = await supabase
        .from("vehicles")
        .select("id")
        .eq("id", vehicleId)
        .eq("customer_id", customer.id)
        .eq("shop_id", customer.shop_id)
        .maybeSingle();
      if (vehicleErr) return bad(vehicleErr.message, 500);
      if (!vehicle) return bad("Vehicle does not belong to this customer and shop", 403);
    }

    const quoteLineId =
      typeof body.quoteLineId === "string" && body.quoteLineId.trim()
        ? body.quoteLineId.trim()
        : null;
    if (quoteLineId) {
      const quotePayload = {
        p_quote_line_id: quoteLineId,
        p_customer_id: customer.id,
        p_actor_user_id: actor.userId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_visit_type: visitType,
        p_operation_key: `${customer.shop_id}:portal-repair-quote-booking:${normalizedKey}`,
        p_at: new Date().toISOString(),
      };
      const { data, error } = await (
        supabase as never as {
          rpc: (
            fn: "book_portal_repair_quote_atomic",
            args: typeof quotePayload,
          ) => Promise<{ data: QuoteBookingRpcResult | null; error: { message?: string } | null }>;
        }
      ).rpc("book_portal_repair_quote_atomic", quotePayload);

      if (error || !data?.ok || !data.workOrderId || !data.bookingId) {
        const message = error?.message || "Unable to book this repair quote.";
        return bad(message, message.toLowerCase().includes("overlap") ? 409 : 400);
      }
      return NextResponse.json(
        {
          workOrderId: data.workOrderId,
          bookingId: data.bookingId,
          replayed: data.idempotent === true,
          quoteBooking: true,
        },
        { status: data.idempotent ? 200 : 201 },
      );
    }

    const sourceRowId = `portal_start:${customer.id}:${normalizedKey}`;

    const { data: existingWo, error: existingWoErr } = await supabase
      .from("work_orders")
      .select("id")
      .eq("shop_id", customer.shop_id)
      .eq("customer_id", customer.id)
      .eq("source_row_id", sourceRowId)
      .maybeSingle();

    if (existingWoErr) return bad("Failed to verify request replay", 500);
    if (existingWo?.id) {
      const { data: existingBooking, error: existingBookingErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("work_order_id", existingWo.id)
        .maybeSingle();
      if (existingBookingErr) return bad("Failed to verify existing booking", 500);
      if (existingBooking?.id) {
        return NextResponse.json(
          {
            workOrderId: existingWo.id,
            bookingId: existingBooking.id,
            replayed: true,
          },
          { status: 200 },
        );
      }
    }

    const rpcPayload = {
      p_shop_id: customer.shop_id,
      p_customer_id: customer.id,
      p_vehicle_id: vehicleId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_visit_type: visitType,
      p_notes: (body.notes ?? "").trim() || null,
      p_source_row_id: sourceRowId,
    };

    const { data: created, error: createErr } = await (
      supabase as never as {
        rpc: (
          fn: "portal_request_start_atomic",
          args: typeof rpcPayload,
        ) => Promise<{
          data: StartRpcRow[] | null;
          error: { code?: string; message?: string } | null;
        }>;
      }
    ).rpc("portal_request_start_atomic", rpcPayload);

    if (createErr) {
      if (isDuplicateKeyError(createErr)) {
        const { data: fallbackWo } = await supabase
          .from("work_orders")
          .select("id")
          .eq("shop_id", customer.shop_id)
          .eq("customer_id", customer.id)
          .eq("source_row_id", sourceRowId)
          .maybeSingle();

        if (fallbackWo?.id) {
          const { data: fallbackBooking } = await supabase
            .from("bookings")
            .select("id")
            .eq("work_order_id", fallbackWo.id)
            .maybeSingle();
          if (fallbackBooking?.id) {
            return NextResponse.json(
              {
                workOrderId: fallbackWo.id,
                bookingId: fallbackBooking.id,
                replayed: true,
              },
              { status: 200 },
            );
          }
        }
      }

      if (createErr.code === "P0001" || createErr.code === "23P01") {
        return bad(createErr.message || "This time overlaps an existing booking", 409);
      }
      return bad(createErr.message || "Failed to start request", 500);
    }

    const row = Array.isArray(created) ? created[0] : null;
    if (!row?.work_order_id || !row.booking_id) {
      return bad("Failed to create work order and booking", 500);
    }

    return NextResponse.json(
      {
        workOrderId: row.work_order_id,
        bookingId: row.booking_id,
        replayed: Boolean(row.deduped),
      },
      { status: row.deduped ? 200 : 201 },
    );
  } catch (e: unknown) {
    if (e instanceof PortalAccessError) return bad(e.message, e.status);
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request start error:", msg);
    return bad("Unexpected error", 500);
  }
}

