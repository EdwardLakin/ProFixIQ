import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Stripe from "stripe";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = params.id;

  try {
    // ---- Guard: Stripe key ----
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
    });

    // ---- Load WO ----
    const { data: wo, error: woErr } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();
    if (woErr) throw woErr;
    if (!wo) return NextResponse.json({ ok: false, error: "Work order not found" }, { status: 404 });

    // ---- Load customer ----
    if (!wo.customer_id) {
      return NextResponse.json({ ok: false, error: "Work order has no customer_id" }, { status: 400 });
    }
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, email")
      .eq("id", wo.customer_id)
      .maybeSingle();
    if (custErr) throw custErr;
    if (!cust?.email) return NextResponse.json({ ok: false, error: "Customer email required" }, { status: 400 });

    // ---- Load lines ----
    const { data: lines, error: linesErr } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id);
    if (linesErr) throw linesErr;

    // ---- Build invoice items (labor only for now) ----
    const laborRate = 120; // TODO: pull from shop settings when available
    const laborItems: { description: string; unit_amount: number; quantity: number }[] = [];

    for (const ln of lines ?? []) {
      const hours = typeof ln.labor_time === "number" ? ln.labor_time : 0;
      if (hours > 0) {
        const title =
          `${String(ln.job_type ?? "job").toString().replaceAll("_", " ")} — ${ln.description ?? ln.complaint ?? "labor"}`;
        laborItems.push({
          description: title,
          unit_amount: Math.round(laborRate * 100), // cents / hour
          quantity: hours,
        });
      }
    }

    if (laborItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No billable labor found. Add hours to at least one line." },
        { status: 400 },
      );
    }

    // ---- Create a Stripe customer (simple path; can be upgraded to reuse later) ----
    const customer = await stripe.customers.create({
      email: cust.email,
      name: [cust.first_name ?? "", cust.last_name ?? ""].filter(Boolean).join(" ") || undefined,
      metadata: { profix_work_order_id: wo.id },
    });

    // ---- Draft invoice ----
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      auto_advance: true,
      collection_method: "send_invoice",
      days_until_due: 7,
      metadata: { profix_work_order_id: wo.id },
    });

    // ---- Attach invoice items (tied to customer) ----
    for (const item of laborItems) {
      await stripe.invoiceItems.create({
        ...item,
        currency: "usd",
        customer: customer.id,
      });
    }

    // ---- Finalize & email ----
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalized.id);

    // ---- Persist: mark invoiced on WO (string status; no enum cast) ----
    const { error: updErr } = await supabase
      .from("work_orders")
      .update({
        status: "invoiced",
        stripe_invoice_id: finalized.id,
      })
      .eq("id", wo.id);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, stripeInvoiceId: finalized.id });
  } catch (e: any) {
    const msg = e?.message ?? "Failed to create/send invoice";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}