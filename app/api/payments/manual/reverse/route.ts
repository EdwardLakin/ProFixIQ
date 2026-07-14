import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { postPaymentEvent } from "@/features/invoices/server/financialLifecycle";
import { getInvoiceVersionById } from "@/features/invoices/server/invoiceVersionQueries";

type DB = Database;
type Body = {
  invoiceVersionId?: string;
  amount?: number;
  reason?: string;
  reference?: string | null;
  idempotencyKey?: string;
};

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const invoiceVersionId = body?.invoiceVersionId?.trim() ?? "";
    const reason = body?.reason?.trim() ?? "";
    const amount = Number(body?.amount);
    const idempotencyKey =
      body?.idempotencyKey?.trim() || req.headers.get("idempotency-key")?.trim() || "";
    if (!invoiceVersionId || !reason || !idempotencyKey) {
      return NextResponse.json(
        { error: "invoiceVersionId, reason, and idempotencyKey are required" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const version = await getInvoiceVersionById({
      supabase: admin,
      invoiceVersionId,
      shopId: access.profile.shop_id,
    });
    if (!version) return NextResponse.json({ error: "Invoice version not found" }, { status: 404 });

    const result = await postPaymentEvent({
      supabase: admin,
      shopId: access.profile.shop_id,
      workOrderId: version.work_order_id,
      invoiceVersionId: version.id,
      eventKind: "manual_reversal",
      amount,
      currency: version.currency,
      paymentMethod: "manual_reversal",
      processor: "manual",
      processorPaymentId: body?.reference?.trim() || null,
      operationKey: `manual-reversal:${access.profile.shop_id}:${idempotencyKey}`,
      actorUserId: access.profile.id,
      metadata: { reason, reference: body?.reference?.trim() || null },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to reverse payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
