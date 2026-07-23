import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import {
  createPortalQuoteRequest,
  type PortalQuoteRequestKind,
} from "@/features/portal/server/createPortalQuoteRequest";

export const runtime = "nodejs";

type Body = {
  workOrderId?: string | null;
  vehicleId?: string | null;
  requestKind?: PortalQuoteRequestKind;
  description?: string;
  notes?: string | null;
  qty?: number | string | null;
  idempotencyKey?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const body = (await req.json().catch(() => null)) as Body | null;
    const description = clean(body?.description);
    const workOrderId = clean(body?.workOrderId) || null;
    const requestKind = body?.requestKind === "parts_only" ? "parts_only" : "repair";
    const operationKey =
      clean(req.headers.get("Idempotency-Key")) || clean(body?.idempotencyKey);
    const rawQty = Number(body?.qty ?? 1);
    const qty = Number.isFinite(rawQty) ? Math.max(1, Math.min(99, Math.trunc(rawQty))) : 1;

    if (!actor.customer.shop_id) return bad("Customer is not linked to a shop", 409);
    if (!description) return bad("Quote request description is required.");
    if (!operationKey) return bad("A stable Idempotency-Key is required.");

    let vehicleId = clean(body?.vehicleId);
    if (workOrderId) {
      const { data: workOrder, error } = await supabase
        .from("work_orders")
        .select("id, vehicle_id")
        .eq("id", workOrderId)
        .eq("shop_id", actor.customer.shop_id)
        .eq("customer_id", actor.customer.id)
        .maybeSingle();
      if (error) return bad("Unable to load this request.", 500);
      if (!workOrder) return bad("Work order not found.", 404);
      vehicleId = vehicleId || clean(workOrder.vehicle_id);
    }
    if (!vehicleId) return bad("A vehicle is required for a quote request.");

    const result = await createPortalQuoteRequest({
      supabase,
      shopId: actor.customer.shop_id,
      customerId: actor.customer.id,
      vehicleId,
      workOrderId,
      actorUserId: actor.userId,
      requestKind,
      description,
      notes: clean(body?.notes) || null,
      qty,
      operationKey: `${actor.customer.shop_id}:portal-quote:${operationKey}`,
    });

    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    const message = error instanceof Error ? error.message : "Unexpected error";
    const normalized = message.toLowerCase();
    const status = normalized.includes("not owned") || normalized.includes("mismatch")
      ? 403
      : normalized.includes("locked")
        ? 409
        : 400;
    return bad(message, status);
  }
}

