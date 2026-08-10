import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RpcError = { message?: string | null; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function rpcMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

export async function GET(request: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const startsAt = request.nextUrl.searchParams.get("startsAt")?.trim() ?? "";
  const endsAt = request.nextUrl.searchParams.get("endsAt")?.trim() ?? "";
  const modeRaw = request.nextUrl.searchParams.get("mode")?.trim() ?? "";
  const mode = modeRaw === "shop" || modeRaw === "mobile" ? modeRaw : null;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!startsAt || !endsAt || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Valid startsAt and endsAt are required." }, { status: 400 });
  }

  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "scheduler_list_events",
    {
      p_shop_id: access.profile.shop_id,
      p_starts_at: start.toISOString(),
      p_ends_at: end.toISOString(),
      p_mode: mode,
    },
  );
  if (error) {
    return NextResponse.json({ error: rpcMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ events: Array.isArray(data) ? data : [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
