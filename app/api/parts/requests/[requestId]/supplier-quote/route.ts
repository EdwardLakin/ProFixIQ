import { NextResponse } from "next/server";

import {
  buildSupplierQuoteDraft,
  supplierQuoteContactHref,
} from "@/features/parts/lib/supplierQuoteRequest";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

type Body = {
  supplierId?: string;
  itemIds?: string[];
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  const supplierId = clean(body?.supplierId);
  const channel = body?.channel;
  const rawItemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];
  const itemIds = [...new Set(rawItemIds.map(clean).filter(isUuid))];
  const requestKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    clean(body?.idempotencyKey);

  if (
    !isUuid(requestId) ||
    !isUuid(supplierId) ||
    (channel !== "email" && channel !== "phone") ||
    itemIds.length === 0 ||
    itemIds.length !== rawItemIds.length ||
    !requestKey
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Select a supplier, contact method, and at least one valid part.",
      },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
    allowRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const [requestResult, supplierResult, itemsResult] = await Promise.all([
    access.supabase
      .from("part_requests")
      .select("id,shop_id,work_order_id")
      .eq("id", requestId)
      .eq("shop_id", shopId)
      .maybeSingle(),
    access.supabase
      .from("suppliers")
      .select("id,name,email,phone,is_active")
      .eq("id", supplierId)
      .eq("shop_id", shopId)
      .maybeSingle(),
    access.supabase
      .from("part_request_items")
      .select(
        "id,request_id,shop_id,work_order_id,description,requested_part_number,requested_manufacturer,qty,qty_requested",
      )
      .eq("request_id", requestId)
      .eq("shop_id", shopId)
      .in("id", itemIds)
      .order("created_at", { ascending: true }),
  ]);

  const lookupError =
    requestResult.error ?? supplierResult.error ?? itemsResult.error;
  if (lookupError) {
    const safeError = toSafeDatabaseError(lookupError, {
      context: "parts/supplier-quote/context",
      fallback: "The supplier quote request could not be prepared.",
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

  const partsRequest = requestResult.data;
  const supplier = supplierResult.data;
  const items = itemsResult.data ?? [];
  if (!partsRequest?.work_order_id) {
    return NextResponse.json(
      { ok: false, error: "Parts request is not attached to a work order." },
      { status: 409 },
    );
  }
  if (!supplier || supplier.is_active === false) {
    return NextResponse.json(
      { ok: false, error: "Supplier is not active in this shop." },
      { status: 404 },
    );
  }
  if (items.length !== itemIds.length) {
    return NextResponse.json(
      { ok: false, error: "One or more selected parts are outside this request." },
      { status: 403 },
    );
  }
  if (channel === "email" && !clean(supplier.email)) {
    return NextResponse.json(
      { ok: false, error: "The selected supplier does not have an email address." },
      { status: 409 },
    );
  }
  if (channel === "phone" && !clean(supplier.phone)) {
    return NextResponse.json(
      { ok: false, error: "The selected supplier does not have a phone number." },
      { status: 409 },
    );
  }

  const { data: workOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id,custom_id")
    .eq("id", partsRequest.work_order_id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (workOrderError) {
    const safeError = toSafeDatabaseError(workOrderError, {
      context: "parts/supplier-quote/work-order",
      fallback: "The work order reference could not be loaded.",
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

  const workOrderNumber = clean(workOrder?.custom_id);
  if (!workOrderNumber) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This work order is missing its user-facing number. Repair the work order identity before contacting a supplier.",
      },
      { status: 409 },
    );
  }

  const draft = buildSupplierQuoteDraft({
    workOrderNumber,
    supplierName: supplier.name,
    items: items.map((item) => ({
      description: item.description,
      qty: Math.max(Number(item.qty_requested ?? 0), Number(item.qty ?? 0), 0),
      requestedPartNumber: item.requested_part_number,
      requestedManufacturer: item.requested_manufacturer,
    })),
  });
  const scopedKey = `${shopId}:parts_create_supplier_quote_request:${requestKey}`;
  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "parts_create_supplier_quote_request",
    {
      p_request_id: requestId,
      p_supplier_id: supplierId,
      p_item_ids: itemIds,
      p_channel: channel,
      p_subject: draft.subject,
      p_message: draft.message,
      p_idempotency_key: scopedKey,
    },
  );

  if (error) {
    const safeError = toSafeDatabaseError(error, {
      context: "parts/supplier-quote/create",
      fallback: "The supplier quote request could not be recorded.",
      publicMessagePatterns: [
        /^A parts request and supplier are required\.?$/i,
        /^Select at least one part/i,
        /^Supplier quote channel must/i,
        /^A stable idempotency key is required\.?$/i,
        /^The parts request is not anchored/i,
        /^Completed parts requests cannot/i,
        /^Supplier was not found/i,
        /^The selected supplier does not have/i,
        /^Every selected part must/i,
        /^Only unordered active parts/i,
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

  const launchUrl = supplierQuoteContactHref({
    channel,
    email: supplier.email,
    phone: supplier.phone,
    subject: draft.subject,
    message: draft.message,
  });

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
    launchUrl,
  });
}
