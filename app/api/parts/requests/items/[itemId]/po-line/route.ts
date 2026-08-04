import { NextResponse } from "next/server";
import { idempotencyKey, isUuid, positiveNumber, runPartsLifecycleRpc } from "../../../../_lib/lifecycleCommand";

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const poId = typeof body?.poId === "string" ? body.poId : typeof body?.po_id === "string" ? body.po_id : "";
  const supplierId = typeof body?.supplierId === "string" ? body.supplierId : typeof body?.supplier_id === "string" ? body.supplier_id : "";
  const rawLocationId =
    typeof body?.locationId === "string"
      ? body.locationId
      : typeof body?.location_id === "string"
        ? body.location_id
        : null;
  const locationId = rawLocationId?.trim() || null;
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;
  const qty = positiveNumber(body?.qty);
  const unitCost = body?.unitCost == null ? null : Number(body.unitCost);
  if (!isUuid(itemId) || (!isUuid(poId) && !isUuid(supplierId)) || qty == null || (locationId != null && !isUuid(locationId))) return NextResponse.json({ ok: false, error: "Provide a valid existing PO or supplier, item, location, and quantity." }, { status: 400 });
  return runPartsLifecycleRpc(req, "parts_create_or_reuse_po_line_for_request", {
    p_request_item_id: itemId,
    p_qty: qty,
    p_po_id: isUuid(poId) ? poId : null,
    p_supplier_id: isUuid(supplierId) ? supplierId : null,
    p_unit_cost: Number.isFinite(unitCost) ? unitCost : null,
    p_location_id: locationId,
    p_notes: notes,
    p_idempotency_key: idempotencyKey(req, body ?? {}, `po-line:${poId || supplierId}:${itemId}:${qty}`),
  });
}
