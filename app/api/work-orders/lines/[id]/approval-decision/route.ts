import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";

type RouteContext = { params: Promise<{ id: string }> };
type Decision = "approve" | "decline" | "defer";
type Body = {
  decision?: Decision;
  workOrderId?: string | null;
  idempotencyKey?: string | null;
};
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (lower.includes("not owned") || lower.includes("actor mismatch")) return 403;
  if (lower.includes("locked") || lower.includes("no longer eligible")) return 409;
  return 400;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const { id } = await ctx.params;
    const lineId = safeString(id);
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = safeString(body?.workOrderId);
    const decision = body?.decision;

    if (
      !lineId ||
      !workOrderId ||
      (decision !== "approve" && decision !== "decline" && decision !== "defer")
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing lineId, workOrderId, or decision" },
        { status: 400 },
      );
    }
    if (!actor.customer.shop_id) {
      return NextResponse.json(
        { ok: false, error: "Customer is not linked to a shop" },
        { status: 409 },
      );
    }

    let key =
      req.headers.get("Idempotency-Key")?.trim() ||
      safeString(body?.idempotencyKey);

    if (!key) {
      const { data: currentLine, error: currentLineError } = await supabase
        .from("work_order_lines")
        .select("approval_state,updated_at")
        .eq("id", lineId)
        .eq("work_order_id", workOrderId)
        .eq("shop_id", actor.customer.shop_id)
        .maybeSingle<{
          approval_state: string | null;
          updated_at: string | null;
        }>();

      if (currentLineError) {
        return NextResponse.json(
          { ok: false, error: currentLineError.message },
          { status: 400 },
        );
      }
      if (!currentLine) {
        return NextResponse.json(
          { ok: false, error: "Line item not found" },
          { status: 404 },
        );
      }

      const stateVersion = [
        currentLine.approval_state ?? "none",
        currentLine.updated_at ?? "unknown",
        decision,
      ].join(":");
      key = `derived:${lineId}:${stateVersion}`;
    }

    const rpc = supabase as unknown as RpcClient;
    const { data, error } = await rpc.rpc("apply_portal_line_decision_atomic", {
      p_shop_id: actor.customer.shop_id,
      p_customer_id: actor.customer.id,
      p_work_order_id: workOrderId,
      p_line_id: lineId,
      p_actor_user_id: actor.userId,
      p_decision: decision,
      p_operation_key: `${actor.customer.shop_id}:portal-line-decision:${key}`,
      p_at: new Date().toISOString(),
    });

    if (error) {
      const message = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      return NextResponse.json(
        { ok: false, error: message },
        { status: errorStatus(message) },
      );
    }

    return NextResponse.json(data ?? { ok: true });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Unexpected portal error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
