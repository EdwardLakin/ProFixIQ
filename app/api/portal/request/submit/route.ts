import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";

export const runtime = "nodejs";

type DB = Database;
type Body = {
  workOrderId?: string;
  bookingId?: string;
  customerAgreedAt?: string | null;
  customerSignatureUrl?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown): string | null {
  const text = clean(value);
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return new Date(text).toISOString();
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = clean(body?.workOrderId);
    const bookingId = clean(body?.bookingId);
    const customerAgreedAt = iso(body?.customerAgreedAt);
    const customerSignatureUrl = clean(body?.customerSignatureUrl) || null;

    if (!workOrderId || !bookingId) return bad("Missing workOrderId or bookingId");
    if (!customerAgreedAt) return bad("You must agree to the terms before submitting.");
    if (!actor.customer.shop_id) return bad("Customer is not linked to a shop", 409);

    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id,shop_id,customer_id,portal_submitted_at")
      .eq("id", workOrderId)
      .eq("shop_id", actor.customer.shop_id)
      .eq("customer_id", actor.customer.id)
      .maybeSingle();
    if (workOrderError) return bad("Failed to load work order", 500);
    if (!workOrder) return bad("Work order not found", 404);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,shop_id,customer_id,work_order_id,starts_at,status")
      .eq("id", bookingId)
      .eq("shop_id", workOrder.shop_id)
      .eq("customer_id", actor.customer.id)
      .maybeSingle();
    if (bookingError) return bad("Failed to load booking", 500);
    if (!booking) return bad("Booking not found", 404);
    if (booking.work_order_id && booking.work_order_id !== workOrder.id) return bad("Booking does not belong to this request", 403);

    if (workOrder.portal_submitted_at && booking.status === "pending" && booking.work_order_id === workOrder.id) {
      return NextResponse.json({ ok: true, workOrderId, bookingId, replayed: true });
    }
    const startTime = Date.parse(String(booking.starts_at ?? ""));
    if (Number.isFinite(startTime) && startTime < Date.now() - 60_000) {
      return bad("This booking time is in the past. Please start again.", 409);
    }

    const { count: lineCount, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", workOrder.shop_id)
      .eq("work_order_id", workOrder.id);
    const { count: quoteCount, error: quoteError } = await supabase
      .from("work_order_quote_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", workOrder.shop_id)
      .eq("work_order_id", workOrder.id);
    if (lineError || quoteError) return bad("Failed to verify requested services", 500);
    if ((lineCount ?? 0) + (quoteCount ?? 0) === 0) return bad("Add at least one service or concern before submitting.");

    const submittedAt = new Date().toISOString();
    const workOrderUpdate: DB["public"]["Tables"]["work_orders"]["Update"] = {
      customer_approval_at: customerAgreedAt,
      customer_approval_signature_url: customerSignatureUrl,
      portal_submitted_at: workOrder.portal_submitted_at ?? submittedAt,
    };
    const { error: updateWorkOrderError } = await supabase
      .from("work_orders")
      .update(workOrderUpdate)
      .eq("id", workOrder.id)
      .eq("shop_id", workOrder.shop_id)
      .eq("customer_id", actor.customer.id);
    if (updateWorkOrderError) return bad("Failed to save agreement", 500);

    const bookingUpdate: DB["public"]["Tables"]["bookings"]["Update"] = {
      status: "pending",
      work_order_id: workOrder.id,
    };
    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", booking.id)
      .eq("shop_id", workOrder.shop_id)
      .eq("customer_id", actor.customer.id);
    if (updateBookingError) return bad("Failed to finalize booking", 500);

    return NextResponse.json({ ok: true, workOrderId, bookingId, replayed: false });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    console.error("portal request submit error", error);
    return bad("Unexpected error", 500);
  }
}

