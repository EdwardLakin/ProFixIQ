import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  idempotencyKey,
  isUuid,
  positiveNumber,
  runPartsLifecycleRpcWithAccess,
} from "../../../../_lib/lifecycleCommand";

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
  const hasUnitCost = body?.unitCost != null && body.unitCost !== "";
  const unitCost = hasUnitCost ? Number(body?.unitCost) : null;
  if (
    !isUuid(itemId) ||
    (!isUuid(poId) && !isUuid(supplierId)) ||
    qty == null ||
    (locationId != null && !isUuid(locationId)) ||
    (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0))
  )
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provide a valid existing PO or supplier, item, location, quantity, and acquisition cost.",
      },
      { status: 400 },
    );

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const { data: item, error: itemError } = await access.supabase
    .from("part_request_items")
    .select("id,part_id")
    .eq("id", itemId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (itemError)
    return NextResponse.json(
      { ok: false, error: "Could not verify the request item." },
      { status: 500 },
    );
  if (!item)
    return NextResponse.json(
      { ok: false, error: "Request item not found." },
      { status: 404 },
    );
  if (!item.part_id && unitCost == null) {
    return NextResponse.json(
      {
        ok: false,
        code: "PARTS_ACQUISITION_COST_REQUIRED",
        error:
          "Enter the supplier acquisition cost before ordering this free-text part.",
      },
      { status: 409 },
    );
  }

  return runPartsLifecycleRpcWithAccess(
    access,
    "parts_create_or_reuse_po_line_for_request",
    {
      p_request_item_id: itemId,
      p_qty: qty,
      p_po_id: isUuid(poId) ? poId : null,
      p_supplier_id: isUuid(supplierId) ? supplierId : null,
      p_unit_cost: Number.isFinite(unitCost) ? unitCost : null,
      p_location_id: locationId,
      p_notes: notes,
      p_idempotency_key: idempotencyKey(
        req,
        body ?? {},
        `po-line:${poId || supplierId}:${itemId}:${qty}`,
      ),
    },
  );
}
