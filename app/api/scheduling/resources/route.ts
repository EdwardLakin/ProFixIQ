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

const ResourceSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  resourceType: z.enum(["capacity", "bay", "technician", "service_vehicle"]),
  mode: z.enum(["shop", "mobile", "both"]).default("shop"),
  publicBookable: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
});

function rpcMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "scheduler_list_resources",
    { p_shop_id: access.profile.shop_id },
  );
  if (error) {
    return NextResponse.json({ error: rpcMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ resources: Array.isArray(data) ? data : [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const parsed = ResourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid scheduling resource.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "scheduler_upsert_resource",
    {
      p_shop_id: access.profile.shop_id,
      p_actor_user_id: access.profile.id,
      p_resource_id: null,
      p_code: input.code,
      p_name: input.name,
      p_resource_type: input.resourceType,
      p_mode: input.mode,
      p_public_bookable: input.publicBookable,
      p_active: input.active,
      p_sort_order: input.sortOrder,
    },
  );
  if (error) {
    return NextResponse.json({ error: rpcMessage(error) }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
