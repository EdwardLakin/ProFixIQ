import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const Payload = z.object({
  mode: z.enum(["delete", "void"]),
  disposition: z.enum(["return_to_stock", "keep_consumed", "scrap"]).optional(),
  reservedDisposition: z.literal("release").optional().default("release"),
  orderedDisposition: z
    .enum(["cancel_open_order", "retain_open_order"])
    .optional()
    .default("cancel_open_order"),
  receivedDisposition: z
    .enum(["retain_for_other_work", "return_to_vendor"])
    .optional()
    .default("retain_for_other_work"),
  consumedDisposition: z
    .enum(["return_to_stock", "keep_consumed", "scrap"])
    .optional(),
  reason: z.string().trim().min(1),
  note: z.string().trim().nullable().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid work-order line id." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const json: unknown = await req.json().catch(() => null);
  const parsed = Payload.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid line disposition payload.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const consumedDisposition = body.consumedDisposition ?? body.disposition;
  if (!consumedDisposition) {
    return NextResponse.json(
      { error: "Consumed-parts disposition is required." },
      { status: 400 },
    );
  }

  const rawKey =
    body.idempotencyKey || req.headers.get("idempotency-key")?.trim() || "";
  if (!rawKey) {
    return NextResponse.json(
      { error: "A stable idempotency key is required." },
      { status: 400 },
    );
  }

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("parts_void_work_order_line_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_line_id: id,
    p_mode: body.mode,
    p_reserved_disposition: body.reservedDisposition,
    p_ordered_disposition: body.orderedDisposition,
    p_received_disposition: body.receivedDisposition,
    p_consumed_disposition: consumedDisposition,
    p_reason: body.reason,
    p_note: body.note ?? null,
    p_operation_key: `${access.profile.shop_id}:line-void:${rawKey}`,
    p_actor_user_id: access.profile.id,
  });

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    const status = error.message.includes("FINANCIALLY_LOCKED") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data);
}
