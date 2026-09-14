import { NextRequest, NextResponse } from "next/server";
import {
  addMaintenanceSuggestionToWorkOrder,
  getMaintenanceSuggestionErrorMessage,
} from "@/features/maintenance/server/addMaintenanceSuggestionToWorkOrder";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { StaleCreateWorkOrderError } from "@/features/work-orders/lib/client/validateMutableWorkOrder";

type RequestBody = {
  workOrderId?: string;
  serviceCode?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const workOrderId = body?.workOrderId?.trim();
  const serviceCode = body?.serviceCode?.trim();

  if (!workOrderId || !serviceCode) {
    return NextResponse.json(
      { error: "workOrderId and serviceCode are required" },
      { status: 400 },
    );
  }

  const { data: workOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (workOrderError) {
    return NextResponse.json({ error: workOrderError.message }, { status: 500 });
  }
  if (!workOrder) {
    return NextResponse.json(
      { error: "This saved work order no longer exists. Return to a clean create flow." },
      { status: 409 },
    );
  }

  try {
    const result = await addMaintenanceSuggestionToWorkOrder({
      supabase: access.supabase,
      workOrderId,
      serviceCode,
      userId: access.authUserId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: getMaintenanceSuggestionErrorMessage(error),
      },
      { status: error instanceof StaleCreateWorkOrderError ? 409 : 500 },
    );
  }
}
