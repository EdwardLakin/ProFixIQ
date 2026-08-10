import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Body = {
  workOrderId?: string;
  serviceVisitId?: string | null;
  recommendation?: string;
  disposition?: "quote_later" | "contact_later" | "monitor";
  estimatedAmount?: number | null;
  followUpAt?: string | null;
  notes?: string | null;
  operationKey?: string;
};

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const workOrderId = new URL(request.url).searchParams.get("workOrderId")?.trim() || "";
  if (!workOrderId) return NextResponse.json({ followups: [] });

  const { data, error } = await access.supabase
    .from("mobile_service_followups")
    .select("id,work_order_id,service_visit_id,recommendation,disposition,status,estimated_amount,follow_up_at,notes,recommended_at")
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_id", workOrderId)
    .order("recommended_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ followups: data ?? [] });
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Body | null;
  const operationKey = body?.operationKey?.trim() || request.headers.get("idempotency-key")?.trim() || "";
  if (!body?.workOrderId?.trim() || !body.recommendation?.trim() || !operationKey) {
    return NextResponse.json({ error: "Work order, recommendation, and operation key are required." }, { status: 400 });
  }
  const followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) {
    return NextResponse.json({ error: "Follow-up date is invalid." }, { status: 400 });
  }
  const amount = body.estimatedAmount == null ? null : Number(body.estimatedAmount);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: "Estimated amount is invalid." }, { status: 400 });
  }

  const { data, error } = await access.supabase.rpc("mobile_create_service_followup_atomic", {
    p_shop_id: access.profile.shop_id,
    p_work_order_id: body.workOrderId.trim(),
    p_service_visit_id: body.serviceVisitId?.trim() || null,
    p_recommendation: body.recommendation.trim(),
    p_disposition: body.disposition ?? "quote_later",
    p_estimated_amount: amount,
    p_follow_up_at: followUpAt?.toISOString() ?? null,
    p_notes: body.notes?.trim() || null,
    p_actor_user_id: access.authUserId,
    p_operation_key: operationKey,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.json(data);
}
