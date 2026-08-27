import { NextResponse } from "next/server";

import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

type ResponseLine = {
  partRequestItemId?: string;
  status?: "quoted" | "unavailable";
  supplierPartNumber?: string | null;
  quotedUnitCost?: number | string | null;
  quotedSellPrice?: number | string | null;
  availability?: string | null;
  expectedAt?: string | null;
};

type Body = {
  items?: ResponseLine[];
  notes?: string | null;
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

function finiteNonnegative(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ requestId: string; quoteRequestId: string }> },
) {
  const { requestId, quoteRequestId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const requestKey =
    req.headers.get("Idempotency-Key")?.trim() || clean(body?.idempotencyKey);
  const notes = clean(body?.notes);

  if (
    !isUuid(requestId) ||
    !isUuid(quoteRequestId) ||
    !requestKey ||
    rawItems.length === 0 ||
    rawItems.length > 250 ||
    notes.length > 4000
  ) {
    return NextResponse.json(
      { ok: false, error: "A valid supplier quote response is required." },
      { status: 400 },
    );
  }

  const itemIds = rawItems.map((item) => clean(item.partRequestItemId));
  if (
    itemIds.some((itemId) => !isUuid(itemId)) ||
    new Set(itemIds).size !== itemIds.length
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Each supplier response line must identify one unique part.",
      },
      { status: 400 },
    );
  }

  const normalizedItems: Array<Record<string, unknown>> = [];
  for (const item of rawItems) {
    const status = item.status;
    const quotedUnitCost = finiteNonnegative(item.quotedUnitCost);
    const quotedSellPrice = finiteNonnegative(item.quotedSellPrice);
    const expectedAt = clean(item.expectedAt);
    if (
      (status !== "quoted" && status !== "unavailable") ||
      (status === "quoted" &&
        (quotedUnitCost == null || quotedSellPrice == null)) ||
      clean(item.supplierPartNumber).length > 200 ||
      clean(item.availability).length > 500 ||
      (expectedAt && !validDate(expectedAt))
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Each quoted part needs a valid supplier cost, customer sell price, availability, and ETA.",
        },
        { status: 400 },
      );
    }

    normalizedItems.push({
      part_request_item_id: clean(item.partRequestItemId),
      status,
      supplier_part_number: clean(item.supplierPartNumber) || null,
      quoted_unit_cost: status === "quoted" ? quotedUnitCost : null,
      quoted_sell_price: status === "quoted" ? quotedSellPrice : null,
      availability: clean(item.availability) || null,
      expected_at: expectedAt || null,
    });
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
    allowRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const { data: quoteRequest, error: quoteRequestError } = await access.supabase
    .from("parts_supplier_quote_requests")
    .select("id,shop_id,parts_request_id")
    .eq("id", quoteRequestId)
    .eq("parts_request_id", requestId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (quoteRequestError) {
    const safeError = toSafeDatabaseError(quoteRequestError, {
      context: "parts/supplier-quote/response-context",
      fallback: "The supplier quote request could not be loaded.",
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
  if (!quoteRequest) {
    return NextResponse.json(
      { ok: false, error: "Supplier quote request not found." },
      { status: 404 },
    );
  }

  const scopedKey = `${shopId}:parts_record_supplier_quote_response:${requestKey}`;
  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "parts_record_supplier_quote_response",
    {
      p_quote_request_id: quoteRequestId,
      p_items: normalizedItems,
      p_response_notes: notes || null,
      p_idempotency_key: scopedKey,
    },
  );

  if (error) {
    const safeError = toSafeDatabaseError(error, {
      context: "parts/supplier-quote/response",
      fallback: "The supplier quote response could not be recorded.",
      publicMessagePatterns: [
        /^A supplier quote request and response lines are required/i,
        /^A stable supplier response idempotency key is required/i,
        /^Supplier response notes are too long/i,
        /^Supplier quote request not found/i,
        /^Cancelled supplier quote requests/i,
        /^This supplier quote response has already/i,
        /^Record one response for every part/i,
        /^Each quoted part needs/i,
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

  const { data: quotedItems, error: quotedItemsError } = await access.supabase
    .from("part_request_items")
    .select("id,quote_line_id")
    .eq("shop_id", shopId)
    .eq("request_id", requestId)
    .eq("latest_supplier_quote_request_id", quoteRequestId);

  if (quotedItemsError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The supplier response was recorded, but customer quote pricing could not be refreshed.",
      },
      { status: 500 },
    );
  }

  const quoteLineIds = [
    ...new Set(
      (quotedItems ?? [])
        .map((item) => clean(item.quote_line_id))
        .filter(isUuid),
    ),
  ];
  const syncResults = await Promise.all(
    quoteLineIds.map((quoteLineId) =>
      syncQuoteLinePartsStatus(access.supabase, { shopId, quoteLineId }),
    ),
  );
  const failedSync = syncResults.find((result) => !result.ok);
  if (failedSync) {
    return NextResponse.json(
      {
        ok: false,
        error:
          failedSync.error ||
          "The supplier response was recorded, but customer quote pricing could not be refreshed.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    result: data,
    quoteSync: syncResults,
  });
}
