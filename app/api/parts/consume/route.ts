export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const Payload = z.object({
  work_order_line_id: z.string().uuid(),
  part_id: z.string().uuid(),
  qty: z.coerce.number().positive(),
  location_id: z.string().uuid(),
  unit_cost: z.coerce.number().nonnegative().nullable().optional(),
  idempotency_key: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const json: unknown = await req.json().catch(() => null);
  const parsed = Payload.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const rawKey =
    body.idempotency_key || req.headers.get("idempotency-key")?.trim() || "";
  if (!rawKey) {
    return NextResponse.json(
      { error: "A stable idempotency key is required." },
      { status: 400 },
    );
  }

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc(
    "parts_attach_and_issue_line_part_atomic",
    {
      p_work_order_line_id: body.work_order_line_id,
      p_part_id: body.part_id,
      p_location_id: body.location_id,
      p_qty: body.qty,
      p_unit_cost: body.unit_cost ?? null,
      p_idempotency_key:
        `${access.profile.shop_id}:issue:` +
        `${access.profile.shop_id}:legacy-consume:${rawKey}`,
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const status = error.message.includes("FINANCIALLY_LOCKED") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true, result: data });
}
