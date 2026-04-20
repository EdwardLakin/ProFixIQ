import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { extractPortalIntakeConcern } from "@/features/portal/lib/request/portalIntake";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderId: string;
  bookingId: string;

  // Review gate
  customerAgreedAt?: string | null;
  customerSignatureUrl?: string | null;
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

function parseIsoDate(v: unknown): string | null {
  const s = toNonEmptyString(v);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
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

    const customerAgreedAt = parseIsoDate(body?.customerAgreedAt ?? null);
    if (!customerAgreedAt) return bad("You must agree to the terms before submitting.", 400);

    const customerSignatureUrl = toNonEmptyString(body?.customerSignatureUrl ?? null);

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
      .select("id, shop_id, customer_id, notes, portal_submitted_at")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    // Load booking + ensure same shop
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, shop_id, customer_id, work_order_id, starts_at, ends_at, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) return bad("Failed to load booking", 500);
    if (!booking) return bad("Booking not found", 404);
    if (booking.shop_id !== wo.shop_id) return bad("Not allowed", 403);
    if (booking.customer_id !== customer.id) return bad("Not allowed", 403);

    const warnings: string[] = [];
    const alreadySubmitted = Boolean(wo.portal_submitted_at);
    const alreadyFinalized = booking.status === "confirmed" && booking.work_order_id === wo.id;
    if (alreadySubmitted && alreadyFinalized) {
      return NextResponse.json(
        {
          ok: true,
          workOrderId: wo.id,
          bookingId: booking.id,
          partsRequestId: null,
          replayed: true,
        },
        { status: 200 },
      );
    }

    const startT = Date.parse(String(booking.starts_at ?? ""));
    if (Number.isFinite(startT) && startT < Date.now() - 60_000) {
      return bad("This booking time is in the past. Please start again.", 409);
    }

    const woUpdate: DB["public"]["Tables"]["work_orders"]["Update"] = {
      customer_approval_at: customerAgreedAt,
      customer_approval_signature_url: customerSignatureUrl,
      portal_submitted_at: wo.portal_submitted_at ?? new Date().toISOString(),
    };

    const { error: woUpdErr } = await supabase.from("work_orders").update(woUpdate).eq("id", wo.id);
    if (woUpdErr) return bad("Failed to save agreement/signature", 500);

    const bookingUpdate: DB["public"]["Tables"]["bookings"]["Update"] = {
      status: "confirmed",
      work_order_id: wo.id,
    };

    const { error: updErr } = await supabase.from("bookings").update(bookingUpdate).eq("id", booking.id);
    if (updErr) return bad("Failed to finalize booking", 500);

    const concern = extractPortalIntakeConcern(wo.notes);
    if (concern) {
      const prefix = "[Portal Intake] Diagnostic";
      const desc = `${prefix}: ${concern}`.slice(0, 240);

      // Prevent duplicates: if one already exists on this WO, skip
      const { data: existing, error: exErr } = await supabase
        .from("work_order_lines")
        .select("id")
        .eq("work_order_id", wo.id)
        .ilike("description", `${prefix}%`)
        .limit(1);

      if (!exErr && (!existing || existing.length === 0)) {
        const insertLine: DB["public"]["Tables"]["work_order_lines"]["Insert"] = {
          work_order_id: wo.id,
          shop_id: wo.shop_id,

          // Make the intake visible in the workflow immediately:
          job_type: "diagnostic",
          status: "awaiting",
          description: desc,
          complaint: concern,
          notes: "Auto-created from portal intake on submit.",
        };

        const { error: insertErr } = await supabase.from("work_order_lines").insert(insertLine);
        if (insertErr) {
          warnings.push("portal_intake_line_insert_failed");
          console.warn("portal submit: failed to insert intake line", {
            workOrderId: wo.id,
            bookingId: booking.id,
            message: insertErr.message,
          });
        }
      } else if (exErr) {
        warnings.push("portal_intake_line_check_failed");
        console.warn("portal submit: failed to verify existing intake line", {
          workOrderId: wo.id,
          bookingId: booking.id,
          message: exErr.message,
        });
      }
    }

    const { data: lines, error: linesErr } = await supabase
      .from("work_order_lines")
      .select("id, complaint, parts_needed")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });

    if (linesErr) {
      warnings.push("work_order_lines_load_failed");
      console.warn("portal submit: failed to load work_order_lines", {
        workOrderId: wo.id,
        bookingId: booking.id,
        message: linesErr.message,
      });

      return NextResponse.json(
        { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId: null, warnings },
        { status: 200 },
      );
    }

    const items: { description: string; qty: number }[] = [];

    for (const line of lines ?? []) {
      const r = line as unknown as Record<string, unknown>;
      const complaint = toNonEmptyString(r["complaint"]);
      const partsNeededRaw = r["parts_needed"];

      if (Array.isArray(partsNeededRaw)) {
        for (const p of partsNeededRaw) {
          const pr = p as PartsNeededItem;
          const name = toNonEmptyString(pr?.name ?? null);
          if (!name) continue;
          items.push({ description: name, qty: toPositiveQty(pr?.qty, 1) });
        }
        continue;
      }

      if (complaint) items.push({ description: complaint, qty: 1 });
    }

    if (items.length === 0) {
      return NextResponse.json(
        { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId: null, warnings },
        { status: 200 },
      );
    }

    type RpcArgs = DB["public"]["Functions"]["create_part_request_with_items"]["Args"];

    const rpcArgs: RpcArgs = {
      p_work_order_id: wo.id,
      p_items: items as unknown as RpcArgs["p_items"],
      p_notes: "Portal request submit: auto parts quote",
    };

    const { data: partsRequestId, error: prErr } = await supabase.rpc("create_part_request_with_items", rpcArgs);

    if (prErr) {
      warnings.push("parts_request_create_failed");
      console.warn("portal submit: create_part_request_with_items failed", {
        workOrderId: wo.id,
        bookingId: booking.id,
        message: prErr.message,
      });
      return NextResponse.json(
        { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId: null, warnings },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: true, workOrderId: wo.id, bookingId: booking.id, partsRequestId, warnings },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request submit error:", msg);
    return bad("Unexpected error", 500);
  }
}
