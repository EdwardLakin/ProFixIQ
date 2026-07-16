export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { AdvisorWorkOrderDraft } from "@/features/work-orders/mobile/advisorOfflineTypes";

function statusFor(message: string): number {
  const value = message.toLowerCase();
  if (value.includes("not authenticated")) return 401;
  if (value.includes("not allowed") || value.includes("different shop"))
    return 403;
  if (value.includes("not found")) return 404;
  if (value.includes("idempotency") || value.includes("conflict")) return 409;
  return 400;
}

export async function POST(request: NextRequest) {
  const operationKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }
  const draft = (await request
    .json()
    .catch(() => null)) as AdvisorWorkOrderDraft | null;
  if (
    !draft ||
    draft.operationKey !== operationKey ||
    !draft.customerId ||
    !draft.vehicleId
  ) {
    return NextResponse.json(
      {
        error:
          "A canonical customer, vehicle, and matching operation key are required.",
      },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(draft.lines) ||
    draft.lines.length === 0 ||
    draft.lines.length > 50
  ) {
    return NextResponse.json(
      { error: "A draft requires between 1 and 50 job lines." },
      { status: 400 },
    );
  }
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id,role")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null; role: string | null }>();
  if (
    !profile?.shop_id ||
    !getActorCapabilities({ role: profile.role }).canManageWorkOrders
  ) {
    return NextResponse.json(
      { error: "Not allowed to create work orders." },
      { status: 403 },
    );
  }
  if (draft.userId !== user.id || draft.shopId !== profile.shop_id) {
    return NextResponse.json(
      { error: "Draft belongs to a different user or shop." },
      { status: 403 },
    );
  }
  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: profile.shop_id,
  });
  if (contextError)
    return NextResponse.json(
      { error: "Shop security context could not be initialized." },
      { status: 500 },
    );

  const rpc = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{
      data: unknown;
      error: {
        message: string;
        details?: string | null;
        hint?: string | null;
      } | null;
    }>;
  };
  const { data, error } = await rpc.rpc(
    "materialize_offline_work_order_draft_atomic",
    {
      p_shop_id: profile.shop_id,
      p_actor_user_id: user.id,
      p_operation_key: operationKey,
      p_customer_id: draft.customerId,
      p_vehicle_id: draft.vehicleId,
      p_payload: draft,
    },
  );
  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json(
      { error: message },
      { status: statusFor(message) },
    );
  }
  return NextResponse.json(data);
}
