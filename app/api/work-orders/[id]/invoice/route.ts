// app/api/work-orders/[id]/invoice/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Stripe from "stripe";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/");
  return parts.length >= 5 ? parts[3] : null; // ["", "api", "work-orders", "<id>", "invoice"]
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = getIdFromUrl(req.url);
  if (!woId) {
    return NextResponse.json({ ok: false, error: "Missing work order id" }, { status: 400 });
  }

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
    });

    const { data: wo } = await supabase
      .from("work_orders")
      .select("*")
      .eq("id", woId)
      .maybeSingle();
    if (!wo) return NextResponse.json({ ok: false, error: "Work order not found" }, { status: 404 });

    const { data: cust } = await supabase
      .from("customers")
      .select("first_name,last_name,email")
      .eq("id", wo.customer_id!)
      .maybeSingle();
    if (!cust?.email) return NextResponse.json({ ok: false, error: "Customer email required" }, { status: 400 });

    const { data: lines } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id);

    const laborRate = 120;
    const invoiceItems = [];

    for (const ln of lines ?? []) {
      const hours = typeof ln.labor_time === "number" ? ln.labor_time : 0;
      if (hours > 0) {
        invoiceItems.push({
          currency: "usd",
          description: `${ln.job_type ?? "job"} — ${ln.description ?? ln.complaint ?? "labor"}`.replaceAll("_", " "),
          unit_amount: Math.round(laborRate * 100),
          quantity: hours,
        });
      }
    }

    if (!invoiceItems.length) {
      return NextResponse.json({ ok: false, error: "No billable labor found" }, { status: 400 });
    }

    const customer = await stripe.customers.create({
      email: cust.email,
      name: [cust.first_name, cust.last_name].filter(Boolean).join(" "),
    });

    const invoice = await stripe.invoices.create({
      customer: customer.id,
      auto_advance: true,
      collection_method: "send_invoice",
      days_until_due: 7,
    });

    for (const ii of invoiceItems) {
      await stripe.invoiceItems.create({ ...ii, customer: customer.id });
    }

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalized.id);

    await supabase
      .from("work_orders")
      .update({
        status: "invoiced",
        stripe_invoice_id: finalized.id,
      })
      .eq("id", wo.id);

    return NextResponse.json({ ok: true, stripeInvoiceId: finalized.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Invoice failed" }, { status: 500 });
  }
}