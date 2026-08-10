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

type FollowupRow = {
  id: string;
  work_order_id: string;
  service_visit_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  recommendation: string;
  disposition: string;
  status: string;
  estimated_amount: number | string | null;
  follow_up_at: string | null;
  notes: string | null;
  recommended_at: string;
};

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const workOrderId =
    new URL(request.url).searchParams.get("workOrderId")?.trim() || "";

  let query = access.supabase
    .from("mobile_service_followups")
    .select(
      "id,work_order_id,service_visit_id,customer_id,vehicle_id,recommendation,disposition,status,estimated_amount,follow_up_at,notes,recommended_at",
    )
    .eq("shop_id", access.profile.shop_id);
  query = workOrderId
    ? query.eq("work_order_id", workOrderId)
    : query.eq("status", "open");

  const { data, error } = await query
    .order("follow_up_at", { ascending: true, nullsFirst: false })
    .order("recommended_at", { ascending: false })
    .limit(workOrderId ? 50 : 100);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const followups = (data ?? []) as FollowupRow[];
  if (workOrderId || followups.length === 0) {
    return NextResponse.json({ followups });
  }

  const workOrderIds = [...new Set(followups.map((row) => row.work_order_id))];
  const customerIds = [
    ...new Set(followups.map((row) => row.customer_id).filter(Boolean)),
  ] as string[];
  const vehicleIds = [
    ...new Set(followups.map((row) => row.vehicle_id).filter(Boolean)),
  ] as string[];

  const [workOrdersResult, customersResult, vehiclesResult] = await Promise.all([
    access.supabase
      .from("work_orders")
      .select("id,custom_id")
      .eq("shop_id", access.profile.shop_id)
      .in("id", workOrderIds),
    customerIds.length
      ? access.supabase
          .from("customers")
          .select("id,name")
          .eq("shop_id", access.profile.shop_id)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length
      ? access.supabase
          .from("vehicles")
          .select("id,year,make,model,license_plate")
          .eq("shop_id", access.profile.shop_id)
          .in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const enrichmentError =
    workOrdersResult.error || customersResult.error || vehiclesResult.error;
  if (enrichmentError) {
    return NextResponse.json(
      { error: enrichmentError.message },
      { status: 500 },
    );
  }

  const workOrders = new Map(
    (workOrdersResult.data ?? []).map((row) => [row.id, row.custom_id]),
  );
  const customers = new Map(
    (customersResult.data ?? []).map((row) => [row.id, row.name]),
  );
  const vehicles = new Map(
    (vehiclesResult.data ?? []).map((row) => [
      row.id,
      [row.year, row.make, row.model].filter(Boolean).join(" ") ||
        row.license_plate ||
        "Vehicle",
    ]),
  );

  return NextResponse.json({
    followups: followups.map((row) => ({
      ...row,
      workOrderNumber: workOrders.get(row.work_order_id) ?? null,
      customerName: row.customer_id
        ? customers.get(row.customer_id) ?? null
        : null,
      vehicleLabel: row.vehicle_id ? vehicles.get(row.vehicle_id) ?? null : null,
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Body | null;
  const operationKey =
    body?.operationKey?.trim() ||
    request.headers.get("idempotency-key")?.trim() ||
    "";
  if (!body?.workOrderId?.trim() || !body.recommendation?.trim() || !operationKey) {
    return NextResponse.json(
      { error: "Work order, recommendation, and operation key are required." },
      { status: 400 },
    );
  }
  const followUpAt = body.followUpAt ? new Date(body.followUpAt) : null;
  if (followUpAt && Number.isNaN(followUpAt.getTime())) {
    return NextResponse.json(
      { error: "Follow-up date is invalid." },
      { status: 400 },
    );
  }
  const amount =
    body.estimatedAmount == null ? null : Number(body.estimatedAmount);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json(
      { error: "Estimated amount is invalid." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "mobile_create_service_followup_atomic",
    {
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
    },
  );
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 400 },
    );
  return NextResponse.json(data);
}
