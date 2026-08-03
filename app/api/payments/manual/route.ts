import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  getActiveInvoiceVersion,
  postPaymentEvent,
} from "@/features/invoices/server/financialLifecycle";

type DB = Database;
const PAYMENT_ROLES = ["owner", "admin", "manager", "advisor", "service"] as const;
const METHODS = new Set(["cash", "cheque", "terminal", "eft", "financing", "other"]);

type Body = {
  workOrderId?: string;
  amount?: number;
  method?: string;
  reference?: string | null;
  note?: string | null;
  receivedAt?: string | null;
  idempotencyKey?: string;
};

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: [...PAYMENT_ROLES],
  });
  if (!access.ok) return access.response;

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    const method = body?.method?.trim().toLowerCase() ?? "";
    const amount = Number(body?.amount);
    const idempotencyKey =
      body?.idempotencyKey?.trim() || req.headers.get("idempotency-key")?.trim() || "";

    if (!workOrderId) return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    if (!METHODS.has(method)) {
      return NextResponse.json({ error: "Unsupported payment method" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than zero" }, { status: 400 });
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: "An idempotency key is required" }, { status: 400 });
    }

    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const invoiceVersion = await getActiveInvoiceVersion({
      supabase: admin,
      workOrderId,
      shopId: access.profile.shop_id,
    });
    if (!invoiceVersion) {
      return NextResponse.json({ error: "No finalized invoice found" }, { status: 404 });
    }
    if (!["issued", "partially_paid"].includes(invoiceVersion.lifecycle_status)) {
      return NextResponse.json({ error: "This invoice is not payable" }, { status: 409 });
    }
    if (amount > Number(invoiceVersion.outstanding_total) + 0.01) {
      return NextResponse.json(
        { error: "Payment exceeds the outstanding invoice balance" },
        { status: 409 },
      );
    }

    const occurredAt = body?.receivedAt ? new Date(body.receivedAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json({ error: "Invalid receivedAt timestamp" }, { status: 400 });
    }

    const result = await postPaymentEvent({
      supabase: admin,
      shopId: access.profile.shop_id,
      workOrderId,
      invoiceVersionId: invoiceVersion.id,
      eventKind: "manual_payment",
      amount,
      currency: invoiceVersion.currency,
      paymentMethod: method,
      processor: "manual",
      processorPaymentId: body?.reference?.trim() || null,
      operationKey: `manual:${access.profile.shop_id}:${idempotencyKey}`,
      actorUserId: access.profile.id,
      occurredAt: occurredAt.toISOString(),
      metadata: {
        reference: body?.reference?.trim() || null,
        note: body?.note?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to post payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
