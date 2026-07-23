import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { addPortalRequestLine } from "@/features/portal/server/addPortalRequestLine";

export const runtime = "nodejs";

type Body = {
  workOrderId?: string;
  description?: string;
  notes?: string;
  lineType?: "job" | "info";
  idempotencyKey?: string;
  diagnostic?: boolean;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    const description = body?.description?.trim() ?? "";
    const key =
      req.headers.get("Idempotency-Key")?.trim() ||
      body?.idempotencyKey?.trim() ||
      "";

    if (!workOrderId || !description) {
      return bad("Missing workOrderId or description");
    }
    if (!actor.customer.shop_id) {
      return bad("Customer is not linked to a shop", 409);
    }
    if (!key) {
      return bad("A stable Idempotency-Key is required.");
    }

    const result = await addPortalRequestLine({
      supabase,
      shopId: actor.customer.shop_id,
      customerId: actor.customer.id,
      workOrderId,
      actorUserId: actor.userId,
      kind: "custom",
      description,
      notes: body?.notes?.trim() || null,
      lineType: body?.lineType === "info" ? "info" : "job",
      operationKey: `${actor.customer.shop_id}:portal-custom-line:${key}`,
      diagnostic: body?.diagnostic === true,
    });

    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return bad(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    const lower = message.toLowerCase();
    const status = lower.includes("not owned") ? 403 : lower.includes("locked") ? 409 : 400;
    return bad(message, status);
  }
}
