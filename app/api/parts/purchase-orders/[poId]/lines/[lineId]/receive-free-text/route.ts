import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import {
  idempotencyKey,
  isUuid,
  positiveNumber,
  runPartsLifecycleRpcWithAccess,
} from "../../../../../_lib/lifecycleCommand";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ poId: string; lineId: string }> },
) {
  const { poId, lineId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const qty = positiveNumber(body?.qty);

  if (!isUuid(poId) || !isUuid(lineId) || qty == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "Provide a valid purchase order, line, and receipt quantity.",
      },
      { status: 400 },
    );
  }
  if (Math.round(qty * 100) / 100 !== qty) {
    return NextResponse.json(
      {
        ok: false,
        error: "Receipt quantity cannot use more than two decimal places.",
      },
      { status: 400 },
    );
  }

  // Receiving is separate authority from ordering.
  const access = await requireShopScopedApiAccess({
    requiredWorkspaceCapability: WORKSPACE_CAPABILITIES.receiveParts,
  });
  if (!access.ok) return access.response;

  return runPartsLifecycleRpcWithAccess(
    access,
    "parts_receive_free_text_po_line",
    {
      p_po_id: poId,
      p_po_line_id: lineId,
      p_qty: qty,
      p_idempotency_key: idempotencyKey(req, body ?? {}),
    },
  );
}
