import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { requireWorkOrderOwnedByCustomer } from "@/features/portal/server/portalAuth";

type DB = Database;

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await context.params;
    if (!sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Invalid Stripe session" }, { status: 400 });
    }

    const sessionClient = createServerSupabaseRoute();
    const actor = await requirePortalCustomerActor(sessionClient);
    const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const workOrderId = String(session.metadata?.work_order_id ?? "").trim();
    const customerId = String(session.metadata?.customer_id ?? "").trim();
    if (!workOrderId || customerId !== actor.customer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await requireWorkOrderOwnedByCustomer(
      sessionClient,
      workOrderId,
      actor.customer.id,
    );

    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: payment } = await admin
      .from("payments")
      .select("id,status,payment_event_id,invoice_version_id,amount_cents,currency,paid_at")
      .eq("stripe_session_id", sessionId)
      .maybeSingle<{
        id: string;
        status: string | null;
        payment_event_id: string | null;
        invoice_version_id: string | null;
        amount_cents: number | null;
        currency: string | null;
        paid_at: string | null;
      }>();

    if (!payment?.payment_event_id) {
      return NextResponse.json({
        state: session.payment_status === "paid" ? "processing" : "pending",
        paymentStatus: session.payment_status,
      });
    }

    const { data: receipt } = await (admin as unknown as {
      from(table: string): {
        select(columns: string): {
          eq(column: string, value: string): {
            maybeSingle<T>(): Promise<{ data: T | null; error: unknown }>;
          };
        };
      };
    })
      .from("payment_receipts")
      .select("id,receipt_number,amount,currency,payment_method,processor_reference,received_at,remaining_balance")
      .eq("payment_event_id", payment.payment_event_id)
      .maybeSingle<{
        id: string;
        receipt_number: string;
        amount: number;
        currency: string;
        payment_method: string | null;
        processor_reference: string | null;
        received_at: string;
        remaining_balance: number;
      }>();

    return NextResponse.json({
      state: payment.status === "succeeded" ? "succeeded" : payment.status ?? "processing",
      payment,
      receipt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to verify payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
