import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RpcError = { message?: string | null; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const BodySchema = z.object({
  resourceId: z.string().uuid(),
  operationKey: z.string().trim().min(8).max(300).optional(),
});

function rpcMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid scheduling resource is required.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supplied = request.headers.get("Idempotency-Key")?.trim();
  const operationKey =
    supplied ||
    parsed.data.operationKey ||
    `${access.profile.shop_id}:assign-event:${id}:${parsed.data.resourceId}`;

  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "scheduler_assign_event_resource_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_event_id: id,
      p_resource_id: parsed.data.resourceId,
      p_actor_user_id: access.profile.id,
      p_operation_key: operationKey,
    },
  );

  if (error) {
    const message = rpcMessage(error);
    const status =
      message.toLowerCase().includes("not found")
        ? 404
        : message.toLowerCase().includes("denied") ||
            message.toLowerCase().includes("authenticated caller")
          ? 403
          : message.toLowerCase().includes("available") ||
              message.toLowerCase().includes("terminal")
            ? 409
            : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data);
}
