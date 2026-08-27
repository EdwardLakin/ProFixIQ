import "server-only";

import { NextResponse } from "next/server";
import { signInspectionPhotoRows } from "@/features/inspections/server/signInspectionPhotoRows";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const { id: workOrderId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    urls?: unknown;
  } | null;
  const urls = Array.isArray(body?.urls)
    ? body.urls
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 100)
    : [];

  const { data: workOrder, error } = await access.supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle<{ id: string }>();
  if (error) {
    return NextResponse.json(
      { error: "Unable to verify Work Order evidence." },
      { status: 500 },
    );
  }
  if (!workOrder) {
    return NextResponse.json(
      { error: "Work Order not found." },
      { status: 404 },
    );
  }

  const signed = await signInspectionPhotoRows({
    sessionClient: access.supabase,
    rows: urls.map((image_url) => ({ image_url })),
  });
  return NextResponse.json({ urls: signed.map((row) => row.image_url) });
}
