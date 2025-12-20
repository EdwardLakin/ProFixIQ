// app/api/portal/request/submit/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderId: string;
  bookingId: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

type PartsNeededItem = {
  name?: string | null;
  qty?: number | null;
};

function toNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function toPositiveQty(v: unknown, fallback = 1): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return fallback;
  return n;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return bad("Not authenticated", 401);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Invalid JSON body");
    }

    const workOrderId = (body?.workOrderId ?? "").trim();
    const bookingId = (body?.bookingId ?? "").trim();
    if (!workOrderId || !bookingId) return bad("Missing workOrderId or bookingId");

    // Resolve portal customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);

    // Load WO + ensure ownership
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, customer_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    // Load booking + ensure same shop
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, shop_id, starts_at, ends_at, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) return bad("Failed to load booking", 500);
    if (!booking) return bad("Booking not found", 404);
    if (booking.shop_id !== wo.shop_id) return bad("Not allowed", 403);

    // Optional sanity
    const startT = Date.parse(String(booking.starts_at ?? ""));
    if (Number.isFinite(startT) && startT < Date.now() - 60_000) {
      return bad("This booking time is in the past. Please start again.", 409);
    }

    // Finalize booking (Option B)
    const bookingUpdate: DB["public"]["Tables"]["bookings"]["Update"] = {
      status: booking.status ?? "pending",
    };

    const { error: updErr } = await supabase
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", booking.id);

    if (updErr) return bad("Failed to finalize booking", 500);

    /* ------------------------------------------------------------------ */
    /* Parts request creation (NEW)                                         */
    /* ------------------------------------------------------------------ */

    // Pull WO lines (we prefer menu-lines that stored parts_needed)
    const { data: lines, error: linesErr } = await supabase
      .from("work_order_lines")
      .select("id, complaint, parts_needed")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });

    if (linesErr) {
      // Non-fatal: booking still submitted successfully
      console.warn("portal submit: failed to load work_order_lines:", linesErr.message);
      return NextResponse.json(
        { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId: null },
        { status: 200 },
      );
    }

    // Build items list:
    // - If a line has parts_needed: create items from it
    // - Else fall back to complaint as a single “needs quote” item
    const items: { description: string; qty: number }[] = [];

    for (const line of lines ?? []) {
      const rec = line as unknown as Record<string, unknown>;

      const complaint = toNonEmptyString(rec["complaint"]);
      const partsNeededRaw = rec["parts_needed"];

      if (Array.isArray(partsNeededRaw)) {
        for (const p of partsNeededRaw) {
          const pr = p as PartsNeededItem;
          const name = toNonEmptyString(pr?.name ?? null);
          if (!name) continue;
          items.push({ description: name, qty: toPositiveQty(pr?.qty, 1) });
        }
        continue;
      }

      // If no structured parts list, treat complaint as “quote needed”
      if (complaint) {
        items.push({ description: complaint, qty: 1 });
      }
    }

    // If there’s nothing to quote, just finish submit.
    if (items.length === 0) {
      return NextResponse.json(
        { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId: null },
        { status: 200 },
      );
    }

    // Create / reuse active parts request (idempotent function handles duplicates)
    type RpcArgs = DB["public"]["Functions"]["create_part_request_with_items"]["Args"];

    const rpcArgs: RpcArgs = {
      p_work_order_id: wo.id,
      p_items: items as unknown as RpcArgs["p_items"],
      // No job id available in portal flow right now; keep optional
      // p_job_id: undefined,
      p_notes: "Portal request submit: auto parts quote",
    };

    const { data: partsRequestId, error: prErr } = await supabase.rpc(
      "create_part_request_with_items",
      rpcArgs,
    );

    if (prErr) {
      // Non-fatal: booking submitted even if parts request failed
      console.warn("portal submit: create_part_request_with_items failed:", prErr.message);
      return NextResponse.json(
        { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId: null },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request submit error:", msg);
    return bad("Unexpected error", 500);
  }
}