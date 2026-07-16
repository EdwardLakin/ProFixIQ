export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { OfflinePartsRequestDraft } from "@/features/parts/offline/partsRequestDrafts";

function statusFor(message: string): number {
  const value = message.toLowerCase();
  if (value.includes("not authenticated")) return 401;
  if (value.includes("not allowed") || value.includes("different user"))
    return 403;
  if (value.includes("not found")) return 404;
  if (value.includes("idempotency") || value.includes("conflict")) return 409;
  return 400;
}

export async function POST(request: NextRequest) {
  const operationKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  const draft = (await request
    .json()
    .catch(() => null)) as OfflinePartsRequestDraft | null;
  if (
    !operationKey ||
    !draft ||
    draft.operationKey !== operationKey ||
    !draft.workOrderId ||
    !draft.workOrderLineId ||
    !Array.isArray(draft.items) ||
    draft.items.length < 1 ||
    draft.items.length > 100
  ) {
    return NextResponse.json(
      { error: "A valid parts draft and stable Idempotency-Key are required." },
      { status: 400 },
    );
  }
  if (
    draft.items.some(
      (item) =>
        !item.description?.trim() ||
        !Number.isFinite(Number(item.qty)) ||
        Number(item.qty) < 1 ||
        Number(item.qty) > 10000,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Every part requires a description and quantity from 1 to 10,000.",
      },
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
  const capabilities = getActorCapabilities({ role: profile?.role });
  if (
    !profile?.shop_id ||
    (!capabilities.canManageParts &&
      !capabilities.canManageWorkOrders &&
      !capabilities.canPerformAssignedWork)
  ) {
    return NextResponse.json(
      { error: "Not allowed to request parts." },
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
  if (contextError) {
    return NextResponse.json(
      { error: "Shop security context could not be initialized." },
      { status: 500 },
    );
  }
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
    "materialize_offline_parts_request_draft_atomic",
    {
      p_shop_id: profile.shop_id,
      p_actor_user_id: user.id,
      p_operation_key: operationKey,
      p_work_order_id: draft.workOrderId,
      p_work_order_line_id: draft.workOrderLineId,
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
