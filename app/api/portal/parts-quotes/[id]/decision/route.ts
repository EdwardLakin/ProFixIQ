import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { decidePortalPartsQuoteRequest } from "@/features/portal/server/createPortalPartsQuoteRequest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type Body = { decision?: string; choice?: string | null };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    if (!UUID_PATTERN.test(id)) return bad("This quote is unavailable.", 404);

    const body = (await req.json().catch(() => null)) as Body | null;
    const decision = body?.decision === "decline" ? "decline" : body?.decision === "approve" ? "approve" : null;
    if (!decision) return bad("Choose approve or decline.", 400);
    const choice =
      body?.choice === "book_install" ? "book_install" : body?.choice === "order_parts" || !body?.choice ? "order_parts" : null;
    if (decision === "approve" && !choice) return bad("Unsupported approval choice.", 400);

    const result = await decidePortalPartsQuoteRequest({
      supabase,
      requestId: id,
      customerId: actor.customer.id,
      actorUserId: actor.userId,
      decision,
      choice: decision === "approve" ? choice : null,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    const message = error instanceof Error ? error.message : "Unexpected error";
    const normalized = message.toLowerCase();
    const status = normalized.includes("not found")
      ? 404
      : normalized.includes("mismatch") || normalized.includes("invite required")
        ? 403
        : normalized.includes("no longer awaiting") || normalized.includes("updated this quote")
          ? 409
          : 400;
    return bad(message, status);
  }
}
