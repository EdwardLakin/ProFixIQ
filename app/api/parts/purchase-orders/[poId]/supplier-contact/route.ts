import { NextResponse } from "next/server";

import {
  buildPurchaseOrderContactDraft,
  purchaseOrderContactHref,
} from "@/features/parts/lib/purchaseOrderContact";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

type Body = {
  channel?: "email" | "phone";
  idempotencyKey?: string;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: Record<string, unknown> | null;
    error: {
      message?: string | null;
      details?: string | null;
      hint?: string | null;
      code?: string | null;
    } | null;
  }>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ poId: string }> },
) {
  const { poId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  const channel = body?.channel;
  const requestKey =
    req.headers.get("Idempotency-Key")?.trim() || clean(body?.idempotencyKey);

  if (
    !isUuid(poId) ||
    (channel !== "email" && channel !== "phone") ||
    !requestKey
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "A valid purchase order and contact method are required.",
      },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
    allowRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const { data: purchaseOrder, error: purchaseOrderError } =
    await access.supabase
      .from("purchase_orders")
      .select(
        "id,shop_id,supplier_id,work_order_id,supplier_quote_request_id,po_number,status",
      )
      .eq("id", poId)
      .eq("shop_id", shopId)
      .maybeSingle();

  if (purchaseOrderError) {
    const safeError = toSafeDatabaseError(purchaseOrderError, {
      context: "parts/po/supplier-contact/context",
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
  if (
    !purchaseOrder?.supplier_id ||
    !purchaseOrder.work_order_id ||
    !purchaseOrder.supplier_quote_request_id
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This purchase order is not anchored to a supplier quote and work order.",
      },
      { status: 409 },
    );
  }

  const [supplierResult, workOrderResult, linesResult] = await Promise.all([
    access.supabase
      .from("suppliers")
      .select("id,name,email,phone,is_active")
      .eq("id", purchaseOrder.supplier_id)
      .eq("shop_id", shopId)
      .maybeSingle(),
    access.supabase
      .from("work_orders")
      .select("id,custom_id")
      .eq("id", purchaseOrder.work_order_id)
      .eq("shop_id", shopId)
      .maybeSingle(),
    access.supabase
      .from("purchase_order_lines")
      .select("id,description,sku,qty,unit_cost")
      .eq("po_id", poId)
      .order("created_at", { ascending: true }),
  ]);

  const lookupError =
    supplierResult.error ?? workOrderResult.error ?? linesResult.error;
  if (lookupError) {
    const safeError = toSafeDatabaseError(lookupError, {
      context: "parts/po/supplier-contact/details",
      fallback: "The supplier order details could not be loaded.",
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

  const supplier = supplierResult.data;
  const workOrderNumber = clean(workOrderResult.data?.custom_id);
  const lines = linesResult.data ?? [];
  if (!supplier || supplier.is_active === false) {
    return NextResponse.json(
      {
        ok: false,
        error: "Purchase order supplier is not active in this shop.",
      },
      { status: 404 },
    );
  }
  if (!workOrderNumber) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The purchase order work order is missing its user-facing number.",
      },
      { status: 409 },
    );
  }
  if (lines.length === 0) {
    return NextResponse.json(
      { ok: false, error: "The draft purchase order has no lines to send." },
      { status: 409 },
    );
  }
  if (channel === "email" && !clean(supplier.email)) {
    return NextResponse.json(
      {
        ok: false,
        error: "The selected supplier does not have an email address.",
      },
      { status: 409 },
    );
  }
  if (channel === "phone" && !clean(supplier.phone)) {
    return NextResponse.json(
      {
        ok: false,
        error: "The selected supplier does not have a phone number.",
      },
      { status: 409 },
    );
  }

  const draft = buildPurchaseOrderContactDraft({
    workOrderNumber,
    poNumber: purchaseOrder.po_number,
    supplierName: supplier.name,
    lines: lines.map((line) => ({
      description: line.description,
      sku: line.sku,
      qty: Number(line.qty ?? 0),
      unitCost: line.unit_cost == null ? null : Number(line.unit_cost),
    })),
  });
  const scopedKey = `${shopId}:parts_mark_purchase_order_contacted:${requestKey}`;
  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "parts_mark_purchase_order_contacted",
    {
      p_po_id: poId,
      p_channel: channel,
      p_idempotency_key: scopedKey,
    },
  );

  if (error) {
    const safeError = toSafeDatabaseError(error, {
      context: "parts/po/supplier-contact",
      fallback: "The purchase order contact could not be recorded.",
      publicMessagePatterns: [
        /^A purchase order and contact channel are required/i,
        /^A stable PO contact idempotency key is required/i,
        /^Purchase order not found/i,
        /^Only a draft or open purchase order/i,
        /^This purchase order is not anchored/i,
        /^Purchase order supplier was not found/i,
        /^The selected supplier does not have/i,
      ],
    });
    return NextResponse.json(
      {
        ok: false,
        error: safeError.message,
        correlationId: safeError.correlationId,
      },
      { status: safeError.isPublicMessage ? 409 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    result: data,
    workOrderNumber,
    supplier: {
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
    },
    draft,
    launchUrl: purchaseOrderContactHref({
      channel,
      email: supplier.email,
      phone: supplier.phone,
      subject: draft.subject,
      message: draft.message,
    }),
  });
}
