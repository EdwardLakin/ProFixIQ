import { NextResponse } from "next/server";
import { idempotencyKey, isUuid, positiveNumber, runPartsLifecycleRpc } from "../../../../_lib/lifecycleCommand";

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const locationId = typeof body?.locationId === "string" ? body.locationId : typeof body?.location_id === "string" ? body.location_id : "";
  const qty = positiveNumber(body?.qty);
  if (!isUuid(itemId) || !isUuid(locationId) || qty == null) return NextResponse.json({ ok: false, error: "Invalid item, location, or quantity." }, { status: 400 });
  return runPartsLifecycleRpc(req, "parts_allocate_request_item", {
    p_request_item_id: itemId,
    p_location_id: locationId,
    p_qty: qty,
    p_idempotency_key: idempotencyKey(req, body ?? {}, `allocate:${itemId}:${locationId}:${qty}`),
  });
}
