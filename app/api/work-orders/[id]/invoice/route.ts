import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Stripe from "stripe";
import type { Database } from "@shared/types/types/supabase";
import { recordWorkOrderTraining } from "@/features/integrations/ai";

type DB = Database;

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/"); // ["", "api", "work-orders", "<id>", "invoice"]
  return parts.length >= 5 ? parts[3] : null;
}

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = getIdFromUrl(req.url);

  if (!woId) {
    return NextResponse.json(
      { ok: false, error: "Missing work order id" },
      { status: 400 }
    );
  }

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

    const stripe = new Stripe(key, {
      apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
    });

    // Work order
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("id", woId)
      .maybeSingle();

    if (woErr) throw woErr;
    if (!wo) {
      return NextResponse.json(
        { ok: false, error: "Work order not found" },
        { status: 404 }
      );
    }

    // Customer
    if (!wo.customer_id) {
      return NextResponse.json(
        { ok: false, error: "Work order has no customer" },
        { status: 400 }
      );
    }

    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("first_name,last_name,email")
      .eq("id", wo.customer_id)
      .maybeSingle();

    if (custErr) throw custErr;
    if (!cust?.email) {
      return NextResponse.json(
        { ok: false, error: "Customer email required" },
        { status: 400 }
      );
    }

    // Lines
    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id);

    if (lnErr) throw lnErr;

    // Build labor items
    const laborRate = 120;
    const laborItems: {
      description: string;
      unit_amount: number;
      quantity: number;
    }[] = [];

    for (const ln of lines ?? []) {
      const hours = typeof ln.labor_time === "number" ? ln.labor_time : 0;
      if (hours > 0) {
        laborItems.push({
          description: `${String(ln.job_type ?? "job").replaceAll(
            "_",
            " "
          )} — ${ln.description ?? ln.complaint ?? "labor"}`,
          unit_amount: Math.round(laborRate * 100),
          quantity: hours,
        });
      }
    }

    if (laborItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No billable labor found. Add hours to at least one line before invoicing.",
        },
        { status: 400 }
      );
    }

    // Stripe customer
    const customer = await stripe.customers.create({
      email: cust.email,
      name:
        [cust.first_name ?? "", cust.last_name ?? ""]
          .filter(Boolean)
          .join(" ") || undefined,
      metadata: { profix_work_order_id: wo.id },
    });

    // Draft invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      auto_advance: true,
      collection_method: "send_invoice",
      days_until_due: 7,
      metadata: { profix_work_order_id: wo.id },
    });

    // Attach items
    for (const item of laborItems) {
      await stripe.invoiceItems.create({
        currency: "usd",
        customer: customer.id,
        description: item.description,
        unit_amount: item.unit_amount,
        quantity: item.quantity,
      });
    }

    // Finalize + email
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalized.id);

    const amountTotal =
      "amount_total" in finalized ? finalized.amount_total : null;
    const amountDue =
      "amount_due" in finalized ? finalized.amount_due : null;

    // Persist state
    const { error: updErr } = await supabase
      .from("work_orders")
      .update({ status: "invoiced", stripe_invoice_id: finalized.id })
      .eq("id", wo.id);

    if (updErr) throw updErr;

    // AI training: record that this WO was invoiced
    if (wo.shop_id) {
      try {
        await recordWorkOrderTraining({
          shopId: wo.shop_id,
          workOrderId: wo.id,
          vehicleYmm: null, // TODO: hydrate from vehicles table if needed
          payload: {
            kind: "invoice_sent",
            stripeInvoiceId: finalized.id,
            amount_total: amountTotal,
            amount_due: amountDue,
            currency: finalized.currency ?? "usd",
            customer_email: cust.email,
          },
        });
      } catch (trainErr) {
        console.warn("AI training (invoice) failed:", trainErr);
      }
    }

    return NextResponse.json({
      ok: true,
      stripeInvoiceId: finalized.id,
      amountTotal,
      amountDue,
    });
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Failed to create/send invoice";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}