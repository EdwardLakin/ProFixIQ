import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  assertFinancialEventEmailConfigured,
  sendFinancialEventEmail,
} from "@/features/email/server/sendFinancialEventEmail";
import { upsertPortalNotification } from "@/features/portal/server/upsertPortalNotification";

type DB = Database;
type OutboxRow = {
  outbox_id: string;
  shop_id: string;
  aggregate_id: string;
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type DeliveryClaim = {
  delivery_id: string;
  delivery_key: string;
  delivery_status: string;
  should_send: boolean;
  delivery_attempts: number;
};

type CustomerRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type RpcError = { message: string };
type FinancialOutboxRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type FinancialEmailInput = Parameters<typeof sendFinancialEventEmail>[0];
type ProcessFinancialOutboxOptions = {
  workerId?: string;
  sendEmail?: (
    input: FinancialEmailInput,
  ) => Promise<{ providerMessageId: string | null }>;
  now?: () => Date;
};

const TERMINAL_DELIVERY_STATUSES = new Set([
  "accepted",
  "delivered",
  "bounced",
  "dropped",
]);

async function rpc<T>(
  admin: SupabaseClient<DB>,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const client = admin as unknown as FinancialOutboxRpcClient;
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function firstRpcRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Financial outbox delivery failed";
}

function retryAt(now: Date, attempts: number): string {
  const delayMinutes = Math.min(
    60,
    Math.max(1, 2 ** Math.min(Math.max(attempts - 1, 0), 5)),
  );
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

function formatMoney(value: unknown, currency: unknown) {
  const normalized =
    String(currency ?? "USD").toUpperCase() === "CAD" ? "CAD" : "USD";
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
        customerBody:
          "Your payment was not completed. Your invoice balance has not been reduced.",
        staffSubject: "Customer payment failed",
        staffBody:
          "A customer payment attempt failed and may require follow-up.",
      };
    case "dispute.opened":
    case "dispute.lost":
    case "dispute.won":
      return {
        customerTitle: "Payment status updated",
        customerBody:
          "The status of a payment associated with your invoice has changed.",
        staffSubject: `Payment ${eventType.replaceAll(".", " ")}`,
        staffBody: `A Stripe ${eventType.replaceAll(".", " ")} event was received for an invoice payment.`,
      };
    default:
      return null;
  }
}

async function deliverRecipient(input: {
  admin: SupabaseClient<DB>;
  workerId: string;
  row: OutboxRow;
  recipientKind: "customer" | "staff";
  recipientEmail: string;
  message: Omit<
    FinancialEmailInput,
    "deliveryKey" | "outboxId" | "recipientKind" | "to"
  >;
  sendEmail: NonNullable<ProcessFinancialOutboxOptions["sendEmail"]>;
}) {
  // Fail before reserving a provider-send boundary when configuration is missing.
  assertFinancialEventEmailConfigured();

  const claimData = await rpc<DeliveryClaim[] | DeliveryClaim | null>(
    input.admin,
    "claim_financial_outbox_delivery",
    {
      p_outbox_id: input.row.outbox_id,
      p_worker_id: input.workerId,
      p_recipient_kind: input.recipientKind,
      p_recipient_email: input.recipientEmail,
      p_lease_seconds: 120,
    },
  );
  const claim = firstRpcRow(claimData);
  if (!claim) throw new Error("Financial delivery claim returned no row");

  if (TERMINAL_DELIVERY_STATUSES.has(claim.delivery_status)) return;
  if (claim.delivery_status === "ambiguous") {
    throw new Error(
      `Financial ${input.recipientKind} delivery requires provider reconciliation`,
    );
  }
  if (!claim.should_send || claim.delivery_status !== "claimed") {
    throw new Error(
      `Financial ${input.recipientKind} delivery is not available for this worker`,
    );
  }

  const began = await rpc<boolean>(
    input.admin,
    "begin_financial_outbox_delivery",
    {
      p_delivery_id: claim.delivery_id,
      p_worker_id: input.workerId,
      p_lease_seconds: 120,
    },
  );
  if (!began)
    throw new Error("Financial delivery send boundary could not be started");

  try {
    const result = await input.sendEmail({
      ...input.message,
      to: input.recipientEmail,
      deliveryKey: claim.delivery_key,
      outboxId: input.row.outbox_id,
      recipientKind: input.recipientKind,
    });

    const accepted = await rpc<boolean>(
      input.admin,
      "accept_financial_outbox_delivery",
      {
        p_delivery_id: claim.delivery_id,
        p_worker_id: input.workerId,
        p_provider_message_id: result.providerMessageId,
      },
    );
    if (!accepted)
      throw new Error("Financial delivery acceptance was not recorded");
  } catch (error) {
    // SendGrid has no Mail Send idempotency key. Any failure after the request
    // boundary is therefore ambiguous and must not be retried automatically.
    try {
      await rpc<boolean>(
        input.admin,
        "mark_financial_outbox_delivery_ambiguous",
        {
          p_delivery_id: claim.delivery_id,
          p_worker_id: input.workerId,
          p_error: errorMessage(error),
        },
      );
    } catch {
      // If this acknowledgement also fails, the delivery lease expiry performs
      // the same safe transition to ambiguous for webhook reconciliation.
    }
    throw error;
  }
}

export async function processFinancialOutbox(
  admin: SupabaseClient<DB>,
  limit = 25,
  options: ProcessFinancialOutboxOptions = {},
): Promise<{ processed: number; failed: number }> {
  const workerId = options.workerId ?? randomUUID();
  const now = options.now ?? (() => new Date());
  const sendEmail = options.sendEmail ?? sendFinancialEventEmail;
  const data = await rpc<OutboxRow[] | null>(
    admin,
    "claim_financial_outbox_batch",
    {
      p_worker_id: workerId,
      p_limit: Math.max(1, Math.min(limit, 100)),
      p_lease_seconds: 120,
    },
  );

  let processed = 0;
  let failed = 0;

  for (const row of data ?? []) {
    try {
      const copy = eventCopy(row.event_type, row.payload ?? {});
      if (!copy) {
        const completed = await rpc<boolean>(
          admin,
          "complete_financial_outbox_claim",
          {
            p_outbox_id: row.outbox_id,
            p_worker_id: workerId,
          },
        );
        if (!completed)
          throw new Error("Unsupported financial event could not be completed");
        processed += 1;
        continue;
      }

      const workOrderId = String(row.payload.work_order_id ?? "").trim();
      if (!workOrderId)
        throw new Error("Outbox event is missing work_order_id");

      const { data: workOrder, error: workOrderError } = await admin
        .from("work_orders")
        .select("id,customer_id,custom_id")
        .eq("id", workOrderId)
        .eq("shop_id", row.shop_id)
        .maybeSingle<{
          id: string;
          customer_id: string | null;
          custom_id: string | null;
        }>();
      if (workOrderError || !workOrder) {
        throw new Error(workOrderError?.message ?? "Work order not found");
      }

      let customer: CustomerRow | null = null;
      if (workOrder.customer_id) {
        const customerResult = await admin
          .from("customers")
          .select("id,user_id,email,name,first_name,last_name")
          .eq("id", workOrder.customer_id)
          .eq("shop_id", row.shop_id)
          .maybeSingle<CustomerRow>();
        if (customerResult.error) throw new Error(customerResult.error.message);
        customer = customerResult.data;
      }

      const { data: shop, error: shopError } = await admin
        .from("shops")
        .select("email,business_name,shop_name,name")
        .eq("id", row.shop_id)
        .maybeSingle<{
          email: string | null;
          business_name: string | null;
          shop_name: string | null;
          name: string | null;
        }>();
      if (shopError || !shop)
        throw new Error(shopError?.message ?? "Shop not found");

      const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com"}/portal/invoices/${workOrderId}`;
      if (customer?.user_id) {
        try {
          await upsertPortalNotification(admin, {
            userId: customer.user_id,
            customerId: customer.id,
            workOrderId,
            kind: row.event_type.replaceAll(".", "_"),
            title: copy.customerTitle,
            body: copy.customerBody,
            eventKey: `financial:${row.dedupe_key}`,
            href: `/portal/invoices/${workOrderId}`,
            metadata: { event_type: row.event_type },
          });
        } catch (notificationError) {
          // Portal delivery is independent: a bell failure must never suppress
          // the customer's transactional email or wedge the outbox claim.
          console.error("[financial-outbox] portal notification failed", {
            outboxId: row.outbox_id,
            eventType: row.event_type,
            error: errorMessage(notificationError),
          });
        }
      }

      if (customer?.email) {
        await deliverRecipient({
          admin,
          workerId,
          row,
          recipientKind: "customer",
          recipientEmail: customer.email,
          sendEmail,
          message: {
            shopId: row.shop_id,
            subject: copy.customerTitle,
            heading: copy.customerTitle,
            body: copy.customerBody,
            portalUrl,
            metadata: { event_type: row.event_type },
          },
        });
      }

      if (
        shop.email &&
        row.event_type !== "payment.succeeded" &&
        row.event_type !== "manual.payment"
      ) {
        await deliverRecipient({
          admin,
          workerId,
          row,
          recipientKind: "staff",
          recipientEmail: shop.email,
          sendEmail,
          message: {
            shopId: row.shop_id,
            subject: copy.staffSubject,
            heading: copy.staffSubject,
            body: copy.staffBody,
            metadata: { event_type: row.event_type },
          },
        });
      }

      const completed = await rpc<boolean>(
        admin,
        "complete_financial_outbox_claim",
        {
          p_outbox_id: row.outbox_id,
          p_worker_id: workerId,
        },
      );
      if (!completed)
        throw new Error("Financial outbox has unresolved recipient deliveries");
      processed += 1;
    } catch (deliveryError) {
      const message = errorMessage(deliveryError);
      try {
        await rpc<boolean>(admin, "release_financial_outbox_claim", {
          p_outbox_id: row.outbox_id,
          p_worker_id: workerId,
          p_error: message,
          p_next_attempt_at: retryAt(now(), row.attempts),
        });
      } catch {
        // The row lease safely expires if the release acknowledgement fails.
      }
      failed += 1;
    }
  }

  return { processed, failed };
}
