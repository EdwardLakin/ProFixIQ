import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";

type DB = Database;

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

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(v);
}

function normalizeBody(input: LegacyBody | null): Omit<ReceivePayload, "itemId"> | null {
  if (!input) return null;

  const locationId = String(input.location_id ?? "").trim();
  const qty = typeof input.qty === "number" ? input.qty : Number(input.qty);
  const poId = typeof input.po_id === "string" && input.po_id.trim().length > 0 ? input.po_id.trim() : null;

  if (!locationId || !isUuid(locationId)) return null;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (poId && !isUuid(poId)) return null;

  const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.trim() ? input.idempotencyKey.trim() : typeof input.idempotency_key === "string" && input.idempotency_key.trim() ? input.idempotency_key.trim() : null;
  return { locationId, qty, poId, idempotencyKey };
}

export async function receivePartRequestItem(payload: ReceivePayload): Promise<NextResponse> {
  try {
    if (!isUuid(payload.itemId)) {
      return NextResponse.json({ error: "Invalid itemId (must be UUID)" }, { status: 400 });
    }

    if (!isUuid(payload.locationId)) {
      return NextResponse.json({ error: "Invalid location_id (must be UUID)" }, { status: 400 });
    }

    if (!Number.isFinite(payload.qty) || payload.qty <= 0) {
      return NextResponse.json({ error: "Invalid qty (must be > 0)" }, { status: 400 });
    }

    if (payload.poId && !isUuid(payload.poId)) {
      return NextResponse.json({ error: "Invalid po_id (must be UUID when provided)" }, { status: 400 });
    }

    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    type RpcArgs = DB["public"]["Functions"]["receive_part_request_item"]["Args"];

    const args: RpcArgs = {
      p_item_id: payload.itemId,
      p_location_id: payload.locationId,
      p_qty: payload.qty,
      ...(payload.poId ? { p_po_id: payload.poId } : {}),
      ...(payload.idempotencyKey ? { p_idempotency_key: payload.idempotencyKey } : {}),
    } as RpcArgs;

    const { data, error } = await supabase.rpc("receive_part_request_item", args);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: linkedItem } = await supabase
      .from("part_request_items")
      .select("shop_id, quote_line_id")
      .eq("id", payload.itemId)
      .maybeSingle();

    const quoteLineSync = linkedItem?.shop_id && linkedItem.quote_line_id
      ? await syncQuoteLinePartsStatus(supabase, {
          shopId: linkedItem.shop_id,
          quoteLineId: linkedItem.quote_line_id,
        })
      : null;

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, result: row, quoteLineSync });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function receiveFromCanonicalBody(req: Request, itemId: string): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as LegacyBody | null;
  const normalized = normalizeBody(body);

  if (!normalized) {
    return NextResponse.json(
      { error: "Invalid body. Expect { location_id, qty, po_id? } with UUID ids and qty > 0." },
      { status: 400 },
    );
  }

  return receivePartRequestItem({ itemId, ...normalized });
}

export async function receiveFromLegacyBody(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as LegacyBody | null;
  const itemId = String(body?.part_request_item_id ?? "").trim();
  const normalized = normalizeBody(body);

  if (!itemId || !isUuid(itemId)) {
    return NextResponse.json({ error: "Invalid part_request_item_id (must be UUID)" }, { status: 400 });
  }

  if (!normalized) {
    return NextResponse.json(
      { error: "Invalid body. Expect { part_request_item_id, location_id, qty, po_id? } with UUID ids and qty > 0." },
      { status: 400 },
    );
  }

  return receivePartRequestItem({ itemId, ...normalized });
}
