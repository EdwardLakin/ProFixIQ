import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { sendFinancialEventEmail } from "@/features/email/server/sendFinancialEventEmail";

type DB = Database;
type OutboxRow = {
  id: string;
  shop_id: string;
  aggregate_id: string;
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type DynamicQuery = {
  is(column: string, value: null): DynamicQuery;
  lte(column: string, value: string): DynamicQuery;
  order(column: string, options: { ascending: boolean }): DynamicQuery;
  limit(value: number): DynamicQuery;
  returns<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
};

type DynamicMutation = {
  eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
};

type DynamicClient = {
  from(table: string): {
    select(columns: string): DynamicQuery;
    update(values: Record<string, unknown>): DynamicMutation;
  };
};

function formatMoney(value: unknown, currency: unknown) {
  const normalized = String(currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD";
  return new Intl.NumberFormat(normalized === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency: normalized,
  }).format(Number(value ?? 0));
}

function eventCopy(eventType: string, payload: Record<string, unknown>) {
  const amount = formatMoney(payload.amount, payload.currency);
  const remaining = formatMoney(payload.remaining_balance, payload.currency);
  switch (eventType) {
    case "payment.succeeded":
    case "manual.payment":
      return {
        customerTitle: "Payment received",
        customerBody: `We received your payment of ${amount}. Remaining invoice balance: ${remaining}.`,
        staffSubject: "Invoice payment received",
        staffBody: `A payment of ${amount} was posted. Remaining balance: ${remaining}.`,
      };
    case "refund.succeeded":
    case "manual.reversal":
      return {
        customerTitle: "Payment adjustment posted",
        customerBody: `A payment adjustment of ${amount} was posted. Current invoice balance: ${remaining}.`,
        staffSubject: "Invoice payment adjustment",
        staffBody: `A refund or reversal of ${amount} was posted. Current balance: ${remaining}.`,
      };
    case "payment.failed":
      return {
        customerTitle: "Payment was not completed",
        customerBody: "Your payment was not completed. Your invoice balance has not been reduced.",
        staffSubject: "Customer payment failed",
        staffBody: "A customer payment attempt failed and may require follow-up.",
      };
    case "dispute.opened":
    case "dispute.lost":
    case "dispute.won":
      return {
        customerTitle: "Payment status updated",
        customerBody: "The status of a payment associated with your invoice has changed.",
        staffSubject: `Payment ${eventType.replaceAll(".", " ")}`,
        staffBody: `A Stripe ${eventType.replaceAll(".", " ")} event was received for an invoice payment.`,
      };
    default:
      return null;
  }
}

export async function processFinancialOutbox(
  admin: SupabaseClient<DB>,
  limit = 25,
): Promise<{ processed: number; failed: number }> {
  const client = admin as unknown as DynamicClient;
  const { data, error } = await client
    .from("financial_domain_outbox")
    .select("id,shop_id,aggregate_id,event_type,dedupe_key,payload,attempts")
    .is("delivered_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("occurred_at", { ascending: true })
    .limit(limit)
    .returns<OutboxRow[]>();
  if (error) throw new Error(error.message);

  let processed = 0;
  let failed = 0;

  for (const row of data ?? []) {
    const copy = eventCopy(row.event_type, row.payload ?? {});
    if (!copy) {
      await client
        .from("financial_domain_outbox")
        .update({ delivered_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq("id", row.id);
      processed += 1;
      continue;
    }

    try {
      await client
        .from("financial_domain_outbox")
        .update({ processing_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq("id", row.id);

      const workOrderId = String(row.payload.work_order_id ?? "").trim();
      if (!workOrderId) throw new Error("Outbox event is missing work_order_id");

      const { data: workOrder, error: workOrderError } = await admin
        .from("work_orders")
        .select("id,customer_id,custom_id")
        .eq("id", workOrderId)
        .eq("shop_id", row.shop_id)
        .maybeSingle<{ id: string; customer_id: string | null; custom_id: string | null }>();
      if (workOrderError || !workOrder) {
        throw new Error(workOrderError?.message ?? "Work order not found");
      }

      const [{ data: customer }, { data: shop }] = await Promise.all([
        workOrder.customer_id
          ? admin
              .from("customers")
              .select("id,user_id,email,name,first_name,last_name")
              .eq("id", workOrder.customer_id)
              .maybeSingle<{
                id: string;
                user_id: string | null;
                email: string | null;
                name: string | null;
                first_name: string | null;
                last_name: string | null;
              }>()
          : Promise.resolve({ data: null, error: null }),
        admin
          .from("shops")
          .select("email,business_name,shop_name,name")
          .eq("id", row.shop_id)
          .maybeSingle<{
            email: string | null;
            business_name: string | null;
            shop_name: string | null;
            name: string | null;
          }>(),
      ]);

      const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com"}/portal/invoices/${workOrderId}`;
      if (customer?.user_id) {
        const { error: notificationError } = await admin.from("portal_notifications").upsert(
          {
            user_id: customer.user_id,
            customer_id: customer.id,
            work_order_id: workOrderId,
            kind: row.event_type.replaceAll(".", "_"),
            title: copy.customerTitle,
            body: copy.customerBody,
            event_key: row.dedupe_key,
          } as unknown as DB["public"]["Tables"]["portal_notifications"]["Insert"],
          { onConflict: "user_id,event_key" },
        );
        if (notificationError) throw new Error(notificationError.message);
      }

      if (customer?.email) {
        await sendFinancialEventEmail({
          shopId: row.shop_id,
          to: customer.email,
          subject: copy.customerTitle,
          heading: copy.customerTitle,
          body: copy.customerBody,
          portalUrl,
          metadata: {
            outbox_id: row.id,
            event_type: row.event_type,
            dedupe_key: row.dedupe_key,
          },
        });
      }

      if (shop?.email && row.event_type !== "payment.succeeded" && row.event_type !== "manual.payment") {
        await sendFinancialEventEmail({
          shopId: row.shop_id,
          to: shop.email,
          subject: copy.staffSubject,
          heading: copy.staffSubject,
          body: copy.staffBody,
          metadata: {
            outbox_id: row.id,
            event_type: row.event_type,
            dedupe_key: `${row.dedupe_key}:staff`,
          },
        });
      }

      await client
        .from("financial_domain_outbox")
        .update({
          delivered_at: new Date().toISOString(),
          processing_at: null,
          last_error: null,
        })
        .eq("id", row.id);
      processed += 1;
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : "Delivery failed";
      const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(row.attempts, 5)));
      await client
        .from("financial_domain_outbox")
        .update({
          processing_at: null,
          last_error: message,
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { processed, failed };
}
