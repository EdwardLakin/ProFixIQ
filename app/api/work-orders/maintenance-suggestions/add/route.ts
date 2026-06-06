import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { addMaintenanceSuggestionToWorkOrder } from "@/features/maintenance/server/addMaintenanceSuggestionToWorkOrder";


type RequestBody = {
  workOrderId?: string;
  serviceCode?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;

  const workOrderId = body?.workOrderId?.trim();
  const serviceCode = body?.serviceCode?.trim();

  if (!workOrderId || !serviceCode) {
    return NextResponse.json(
      { error: "workOrderId and serviceCode are required" },
      { status: 400 },
    );
  }

  try {
    const result = await addMaintenanceSuggestionToWorkOrder({
      supabase,
      workOrderId,
      serviceCode,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add maintenance suggestion";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
