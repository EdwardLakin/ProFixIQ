import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

type Body = {
  idempotencyKey?: unknown;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const PLACED_STATUSES = new Set([
  "open",
  "ordered",
  "sent",
  "receiving",
  "received",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ poId: string }> },
) {
  const { poId } = await context.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const idempotencyKey =
    clean(request.headers.get("Idempotency-Key")) ||
    clean(body?.idempotencyKey);

  if (!isUuid(poId) || !idempotencyKey || idempotencyKey.length > 300) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A valid purchase order and stable idempotency key are required.",
      },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const { data: purchaseOrder, error: purchaseOrderError } =
    await access.supabase
      .from("purchase_orders")
      .select("id,status,ordered_at")
      .eq("id", poId)
      .eq("shop_id", shopId)
      .maybeSingle();

  if (purchaseOrderError) {
    const safeError = toSafeDatabaseError(purchaseOrderError, {
      context: "parts/po/place-context",
      fallback: "The purchase order could not be loaded.",
    });
    return NextResponse.json(
      {
        ok: false,
        error: safeError.message,
        correlationId: safeError.correlationId,
      },
      { status: 500 },
    );
  }
  if (!purchaseOrder) {
    return NextResponse.json(
      { ok: false, error: "Purchase order not found." },
      { status: 404 },
    );
  }

  const currentStatus = clean(purchaseOrder.status).toLowerCase();
  if (PLACED_STATUSES.has(currentStatus)) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      result: purchaseOrder,
    });
  }
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only a draft purchase order can be placed." },
      { status: 409 },
    );
  }

  const { data: lines, error: linesError } = await access.supabase
    .from("purchase_order_lines")
    .select("id,qty,cancelled_qty")
    .eq("po_id", poId);
  if (linesError) {
    const safeError = toSafeDatabaseError(linesError, {
      context: "parts/po/place-lines",
      fallback: "The purchase-order lines could not be verified.",
    });
    return NextResponse.json(
      {
        ok: false,
        error: safeError.message,
        correlationId: safeError.correlationId,
      },
      { status: 500 },
    );
  }
  const hasActiveLine = (lines ?? []).some(
    (line) => Number(line.qty ?? 0) - Number(line.cancelled_qty ?? 0) > 0,
  );
  if (!hasActiveLine) {
    return NextResponse.json(
      {
        ok: false,
        error: "Add at least one active line before placing this PO.",
      },
      { status: 409 },
    );
  }

  const orderedAt = purchaseOrder.ordered_at || new Date().toISOString();
  const { data: updated, error: updateError } = await access.supabase
    .from("purchase_orders")
    .update({ status: "open", ordered_at: orderedAt })
    .eq("id", poId)
    .eq("shop_id", shopId)
    .eq("status", "draft")
    .select("id,status,ordered_at")
    .maybeSingle();

  if (updateError) {
    const safeError = toSafeDatabaseError(updateError, {
      context: "parts/po/place",
      fallback: "The purchase order could not be placed.",
    });
    return NextResponse.json(
      {
        ok: false,
        error: safeError.message,
        correlationId: safeError.correlationId,
      },
      { status: 500 },
    );
  }
  if (updated) {
    return NextResponse.json({ ok: true, idempotent: false, result: updated });
  }

  const { data: raced, error: racedError } = await access.supabase
    .from("purchase_orders")
    .select("id,status,ordered_at")
    .eq("id", poId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (racedError) {
    return NextResponse.json(
      { ok: false, error: "The purchase-order state could not be confirmed." },
      { status: 500 },
    );
  }
  if (raced && PLACED_STATUSES.has(clean(raced.status).toLowerCase())) {
    return NextResponse.json({ ok: true, idempotent: true, result: raced });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "The purchase order changed before it could be placed.",
    },
    { status: 409 },
  );
}
