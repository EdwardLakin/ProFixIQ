import { NextResponse } from "next/server";
import {
  DISMISSIBLE_EMPTY_PART_REQUEST_STATUSES,
  isDismissibleEmptyPartRequestStatus,
} from "@/features/parts/lib/requests/empty-request";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  if (!isUuid(requestId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid requestId." },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "parts"],
  });
  if (!access.ok) return access.response;

  const { data: partRequest, error: requestError } = await access.supabase
    .from("part_requests")
    .select("id,status,work_order_id")
    .eq("id", requestId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json(
      { ok: false, error: "Unable to load the parts request." },
      { status: 500 },
    );
  }
  if (!partRequest) {
    return NextResponse.json(
      { ok: false, error: "Parts request not found." },
      { status: 404 },
    );
  }
  if (partRequest.status === "cancelled") {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      requestId,
      status: "cancelled",
    });
  }
  if (!isDismissibleEmptyPartRequestStatus(partRequest.status)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Only an empty request without physical parts activity can be dismissed.",
      },
      { status: 409 },
    );
  }

  const { count, error: itemError } = await access.supabase
    .from("part_request_items")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId)
    .eq("shop_id", access.profile.shop_id);

  if (itemError) {
    return NextResponse.json(
      { ok: false, error: "Unable to verify that the request is empty." },
      { status: 500 },
    );
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "This request contains parts and cannot be dismissed as empty.",
      },
      { status: 409 },
    );
  }

  const { data: updated, error: updateError } = await access.supabase
    .from("part_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("shop_id", access.profile.shop_id)
    .in("status", [...DISMISSIBLE_EMPTY_PART_REQUEST_STATUSES])
    .select("id,status")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: "Unable to dismiss the empty parts request." },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json(
      {
        ok: false,
        error: "The request changed before it could be dismissed. Refresh and review it.",
      },
      { status: 409 },
    );
  }

  await logOperationalEvent({
    supabase: access.supabase,
    event: "parts_request_empty_dismissed",
    actorId: access.profile.id,
    entityType: "part_requests",
    entityId: requestId,
    details: {
      shop_id: access.profile.shop_id,
      work_order_id: partRequest.work_order_id,
      previous_status: partRequest.status,
      status: updated.status,
    },
  });

  return NextResponse.json({
    ok: true,
    idempotent: false,
    requestId,
    status: updated.status,
  });
}
