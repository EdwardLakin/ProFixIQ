import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type ReceivePayload = {
  itemId: string;
  locationId: string;
  qty: number;
  poId?: string | null;
  idempotencyKey?: string | null;
};

type LegacyBody = {
  part_request_item_id?: unknown;
  location_id?: unknown;
  qty?: unknown;
  po_id?: unknown;
  idempotencyKey?: unknown;
  idempotency_key?: unknown;
};

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeBody(input: LegacyBody | null): Omit<ReceivePayload, "itemId"> | null {
  if (!input) return null;
  const locationId = String(input.location_id ?? "").trim();
  const qty = typeof input.qty === "number" ? input.qty : Number(input.qty);
  const poId =
    typeof input.po_id === "string" && input.po_id.trim() ? input.po_id.trim() : null;
  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim()
      : typeof input.idempotency_key === "string" && input.idempotency_key.trim()
        ? input.idempotency_key.trim()
        : null;

  if (!locationId || !isUuid(locationId)) return null;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (poId && !isUuid(poId)) return null;
  if (!idempotencyKey) return null;
  return { locationId, qty, poId, idempotencyKey };
}

export async function receivePartRequestItem(payload: ReceivePayload): Promise<NextResponse> {
  if (!isUuid(payload.itemId) || !isUuid(payload.locationId)) {
    return NextResponse.json({ error: "Invalid item or location id." }, { status: 400 });
  }
  if (!Number.isFinite(payload.qty) || payload.qty <= 0) {
    return NextResponse.json({ error: "Receipt quantity must be greater than zero." }, { status: 400 });
  }
  if (payload.poId && !isUuid(payload.poId)) {
    return NextResponse.json({ error: "Invalid purchase order id." }, { status: 400 });
  }
  const rawKey = payload.idempotencyKey?.trim() ?? "";
  if (!rawKey) {
    return NextResponse.json({ error: "A stable idempotency key is required." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const { data: item, error: itemError } = await access.supabase
    .from("part_request_items")
    .select("id, shop_id")
    .eq("id", payload.itemId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Request item not found for shop." }, { status: 404 });

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("receive_part_request_item", {
    p_item_id: payload.itemId,
    p_location_id: payload.locationId,
    p_qty: payload.qty,
    p_po_id: payload.poId ?? null,
    p_idempotency_key: `${access.profile.shop_id}:receive:${rawKey}`,
  });

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    const status = error.message.includes("FINANCIALLY_LOCKED") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true, result: Array.isArray(data) ? data[0] : data });
}

export async function receiveFromCanonicalBody(
  req: Request,
  itemId: string,
): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as LegacyBody | null;
  const normalized = normalizeBody(body);
  if (!normalized) {
    return NextResponse.json(
      { error: "Invalid body. A stable idempotency key, location UUID, and qty > 0 are required." },
      { status: 400 },
    );
  }
  return receivePartRequestItem({ itemId, ...normalized });
}

export async function receiveFromLegacyBody(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as LegacyBody | null;
  const itemId = String(body?.part_request_item_id ?? "").trim();
  const normalized = normalizeBody(body);
  if (!itemId || !isUuid(itemId) || !normalized) {
    return NextResponse.json(
      { error: "Invalid body. Item, location, qty, and a stable idempotency key are required." },
      { status: 400 },
    );
  }
  return receivePartRequestItem({ itemId, ...normalized });
}
