import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { createPortalPartsQuoteRequest } from "@/features/portal/server/createPortalPartsQuoteRequest";
import { listPortalPartsQuotes } from "@/features/portal/server/portalPartsQuotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  vehicleId?: string | null;
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

export async function GET() {
  const supabase = createServerSupabaseRoute();
  try {
    const actor = await requirePortalCustomerActor(supabase);
    const shopId = actor.customer.shop_id;
    if (!shopId) return bad("Customer is not linked to a shop", 409);

    const { quotes } = await listPortalPartsQuotes({
      admin: createAdminSupabase(),
      shopId,
      customerId: actor.customer.id,
    });
    return NextResponse.json({ quotes });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    console.error("[portal/parts-quotes] list failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return bad("Parts quotes could not be loaded.", 500);
  }
}

export async function POST(req: Request) {
  const userClient = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(userClient);
    const body = (await req.json().catch(() => null)) as Body | null;
    const description = clean(body?.description);
    const vehicleId = clean(body?.vehicleId);
    const operationKey =
      clean(req.headers.get("Idempotency-Key")) || clean(body?.idempotencyKey);
    const rawQty = Number(body?.qty ?? 1);
    const qty = Number.isFinite(rawQty) ? Math.max(1, Math.min(99, Math.trunc(rawQty))) : 1;

    if (!actor.customer.shop_id) return bad("Customer is not linked to a shop", 409);
    if (description.length < 3) return bad("Tell us which part you want quoted.");
    if (!vehicleId) return bad("Choose a vehicle for this parts quote.");
    if (!operationKey) return bad("A stable Idempotency-Key is required.");

    const result = await createPortalPartsQuoteRequest({
      supabase: userClient,
      shopId: actor.customer.shop_id,
      customerId: actor.customer.id,
      vehicleId,
      actorUserId: actor.userId,
      description,
      notes: clean(body?.notes) || null,
      qty,
      operationKey: `${actor.customer.shop_id}:portal-parts-quote:${operationKey}`,
    });

    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    const message = error instanceof Error ? error.message : "Unexpected error";
    const normalized = message.toLowerCase();
    const status =
      normalized.includes("mismatch") || normalized.includes("does not belong")
        ? 403
        : normalized.includes("invite required")
          ? 403
          : 400;
    return bad(message, status);
  }
}
