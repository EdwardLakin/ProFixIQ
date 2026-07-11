import { NextResponse } from "next/server";
import { idempotencyKey, isUuid, positiveNumber, runPartsLifecycleRpc } from "../../../_lib/lifecycleCommand";

export async function POST(req: Request, ctx: { params: Promise<{ partId: string }> }) {
  const { partId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const locationId = typeof body?.locationId === "string" ? body.locationId : typeof body?.location_id === "string" ? body.location_id : "";
  const qty = positiveNumber(body?.qty);
  if (!isUuid(partId) || !isUuid(locationId) || qty == null) return NextResponse.json({ ok: false, error: "Invalid work-order part, location, or quantity." }, { status: 400 });
  return runPartsLifecycleRpc(req, "parts_issue_work_order_part", { p_work_order_part_id: partId, p_location_id: locationId, p_qty: qty, p_idempotency_key: idempotencyKey(req, body ?? {}, `issue:${partId}:${locationId}:${qty}`) });
}
