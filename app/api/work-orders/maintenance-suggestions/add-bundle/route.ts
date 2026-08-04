import { NextRequest, NextResponse } from "next/server";
import { addMaintenanceSuggestionToWorkOrder } from "@/features/maintenance/server/addMaintenanceSuggestionToWorkOrder";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RequestBody = {
  workOrderId?: string;
  serviceCodes?: string[];
};

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const workOrderId = body?.workOrderId?.trim();
  const serviceCodes = Array.isArray(body?.serviceCodes)
    ? body.serviceCodes.map((code) => code.trim()).filter(Boolean)
    : [];

  if (!workOrderId || serviceCodes.length === 0) {
    return NextResponse.json(
      { error: "workOrderId and serviceCodes are required" },
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

  const added: Array<{
    serviceCode: string;
    addedLineId: string;
    addPath: "menu_item" | "generic";
  }> = [];
  const skipped: Array<{ serviceCode: string; error: string }> = [];

  for (const serviceCode of serviceCodes) {
    try {
      const result = await addMaintenanceSuggestionToWorkOrder({
        supabase: access.supabase,
        workOrderId,
        serviceCode,
        userId: access.profile.id,
      });
      added.push({
        serviceCode: result.serviceCode,
        addedLineId: result.addedLineId,
        addPath: result.addPath,
      });
    } catch (error) {
      skipped.push({
        serviceCode,
        error: error instanceof Error ? error.message : "Failed to add bundle item",
      });
    }
  }

  return NextResponse.json({ ok: true, added, skipped });
}
