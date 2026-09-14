import { NextRequest, NextResponse } from "next/server";
import {
  addMaintenanceSuggestionsToWorkOrder,
  getMaintenanceSuggestionErrorMessage,
} from "@/features/maintenance/server/addMaintenanceSuggestionToWorkOrder";
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

  try {
    const result = await addMaintenanceSuggestionsToWorkOrder({
      supabase: access.supabase,
      workOrderId,
      serviceCodes,
      userId: access.profile.id,
    });

    if (result.added.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.skipped.map((item) => item.error).filter(Boolean).join("; ") ||
            "No maintenance items were added.",
          added: result.added,
          skipped: result.skipped,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: getMaintenanceSuggestionErrorMessage(
          error,
          "Failed to add maintenance items to the quote.",
        ),
      },
      { status: 500 },
    );
  }
}
