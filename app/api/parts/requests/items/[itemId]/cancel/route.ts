import { NextResponse } from "next/server";
import { idempotencyKey, isUuid, runPartsLifecycleRpc } from "../../../../_lib/lifecycleCommand";

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isUuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid request item." }, { status: 400 });
  return runPartsLifecycleRpc(req, "parts_cancel_request_item", { p_request_item_id: itemId, p_idempotency_key: idempotencyKey(req, body, `cancel:${itemId}`) });
}
