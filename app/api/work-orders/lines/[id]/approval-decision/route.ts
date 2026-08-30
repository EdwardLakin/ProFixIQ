import { NextResponse, type NextRequest } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import {
  isQuotePricingQuarantineError,
  QUOTE_PRICING_QUARANTINED_CODE,
} from "@/features/work-orders/lib/quotes/quotePricingQuarantine";
import { checkQuotePricingQuarantine } from "@/features/work-orders/server/quotePricingQuarantine";

type RouteContext = { params: Promise<{ id: string }> };
type Decision = "approve" | "decline" | "defer";
type Body = {
  decision?: Decision;
  workOrderId?: string | null;
  idempotencyKey?: string | null;
  actorSurface?: string | null;
};

type StaffDecisionActor = {
  kind: "staff";
  shopId: string;
  userId: string;
};

type PortalDecisionActor = {
  kind: "portal";
  shopId: string;
  customerId: string;
  userId: string;
};

type DecisionActor = StaffDecisionActor | PortalDecisionActor;

type PortalPartsDecisionRpcClient = {
  rpc: (
    name: "apply_portal_parts_hold_line_decline_atomic",
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      message: string;
      details?: string | null;
      hint?: string | null;
    } | null;
  }>;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (isQuotePricingQuarantineError(message)) return 409;
  if (lower.includes("not found")) return 404;
  if (
    lower.includes("not owned") ||
    lower.includes("actor mismatch") ||
    lower.includes("not authorized") ||
    lower.includes("forbidden")
  ) {
    return 403;
  }
  if (
    lower.includes("locked") ||
    lower.includes("busy") ||
    lower.includes("conflict") ||
    lower.includes("no longer eligible") ||
    lower.includes("active_labor") ||
    lower.includes("ineligible")
  ) {
    return 409;
  }
  return 400;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: userError?.message ?? "Not authenticated" },
        { status: 401 },
      );
    }

    const { id } = await ctx.params;
    const lineId = safeString(id);
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = safeString(body?.workOrderId);
    const decision = body?.decision;
    const actorSurface = safeString(body?.actorSurface);

    if (
      !lineId ||
      !workOrderId ||
      (decision !== "approve" && decision !== "decline" && decision !== "defer") ||
      (actorSurface !== "" && actorSurface !== "portal" && actorSurface !== "staff")
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing lineId, workOrderId, or decision" },
        { status: 400 },
      );
    }

    // This was a portal-only contract before Shop approval was added. Preserve
    // existing callers (including cached clients during a rolling deployment)
    // by treating an omitted surface as portal intent. Shop callers must opt in
    // explicitly; the mere presence of a staff profile cannot change ownership
    // checks or actor attribution.
    const staffResolution =
      actorSurface === "staff"
        ? await resolveAuthenticatedStaffProfile(supabase, user.id)
        : null;
    const profile = staffResolution?.profile ?? null;
    const profileError = staffResolution?.error ?? null;
    if (profileError) {
      return NextResponse.json({ ok: false, error: profileError }, { status: 403 });
    }
    if (actorSurface === "staff" && !profile?.shop_id) {
      return NextResponse.json(
        { ok: false, error: "A shop-linked staff profile is required." },
        { status: 403 },
      );
    }

    let actor: DecisionActor;
    if (actorSurface === "staff" && profile?.shop_id) {
      const capabilities = getActorCapabilities({ role: profile.role });
      if (!capabilities.canAuthorizeQuotes) {
        return NextResponse.json(
          { ok: false, error: "This staff role cannot record approval decisions." },
          { status: 403 },
        );
      }
      if (decision === "defer") {
        return NextResponse.json(
          { ok: false, error: "Staff line decisions support approve or decline only." },
          { status: 400 },
        );
      }
      actor = {
        kind: "staff",
        shopId: profile.shop_id,
        userId: user.id,
      };
    } else {
      const portalActor = await requirePortalCustomerActor(supabase);
      if (!portalActor.customer.shop_id) {
        return NextResponse.json(
          { ok: false, error: "Customer is not linked to a shop" },
          { status: 409 },
        );
      }
      actor = {
        kind: "portal",
        shopId: portalActor.customer.shop_id,
        customerId: portalActor.customer.id,
        userId: portalActor.userId,
      };
    }

    // Staff authorization is complete before privilege escalation. Financial
    // workspace RLS can intentionally hide both quote and work-order lines
    // from an otherwise authorized quote decision actor, so use a trusted
    // projection scoped to the already-derived shop, work order, and line.
    // Portal callers retain their end-user projection and ownership RLS.
    const decisionReadClient =
      actor.kind === "staff" ? createAdminSupabase() : supabase;
    const { data: targetLine, error: targetLineError } = await decisionReadClient
      .from("work_order_lines")
      .select("id")
      .eq("id", lineId)
      .eq("work_order_id", workOrderId)
      .eq("shop_id", actor.shopId)
      .maybeSingle<{ id: string }>();

    if (targetLineError) {
      return NextResponse.json(
        { ok: false, error: "Unable to verify the approval target." },
        { status: 500 },
      );
    }
    if (!targetLine) {
      return NextResponse.json(
        { ok: false, error: "Line item not found" },
        { status: 404 },
      );
    }

    const quarantineCheck = await checkQuotePricingQuarantine({
      supabase: decisionReadClient,
      shopId: actor.shopId,
      workOrderId,
      workOrderLineIds: [lineId],
    });
    if (!quarantineCheck.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: quarantineCheck.error,
          ...(quarantineCheck.reason === "quarantined"
            ? { code: QUOTE_PRICING_QUARANTINED_CODE }
            : {}),
        },
        {
          status:
            quarantineCheck.reason === "quarantined"
              ? 409
              : quarantineCheck.reason === "quote_line_not_found"
                ? 404
                : 500,
        },
      );
    }

    let key =
      req.headers.get("Idempotency-Key")?.trim() ||
      safeString(body?.idempotencyKey);

    if (!key) {
      const { data: currentLine, error: currentLineError } =
        await decisionReadClient
          .from("work_order_lines")
          .select("approval_state,updated_at")
          .eq("id", lineId)
          .eq("work_order_id", workOrderId)
          .eq("shop_id", actor.shopId)
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

    const rpc = supabase;
    const rpcResult =
      actor.kind === "staff"
        ? await rpc.rpc("apply_staff_line_decision_atomic", {
            p_shop_id: actor.shopId,
            p_work_order_id: workOrderId,
            p_line_id: lineId,
            p_actor_user_id: actor.userId,
            p_decision: decision,
            p_operation_key: `${actor.shopId}:staff-line-decision:${key}`,
          })
        : decision !== "decline"
          ? await rpc.rpc("apply_portal_line_decision_atomic", {
              p_shop_id: actor.shopId,
              p_customer_id: actor.customerId,
              p_work_order_id: workOrderId,
              p_line_id: lineId,
              p_actor_user_id: actor.userId,
              p_decision: decision,
              p_operation_key: `${actor.shopId}:portal-line-decision:${key}`,
              p_at: new Date().toISOString(),
            })
          : await (rpc as unknown as PortalPartsDecisionRpcClient).rpc(
              "apply_portal_parts_hold_line_decline_atomic",
              {
                p_shop_id: actor.shopId,
                p_customer_id: actor.customerId,
                p_work_order_id: workOrderId,
                p_line_id: lineId,
                p_actor_user_id: actor.userId,
                p_operation_key: `${actor.shopId}:portal-line-decision:${key}`,
                p_at: new Date().toISOString(),
              },
            );

    if (rpcResult.error) {
      const message = [
        rpcResult.error.message,
        rpcResult.error.details,
        rpcResult.error.hint,
      ]
        .filter(Boolean)
        .join(" — ");
      return NextResponse.json(
        { ok: false, error: message },
        { status: errorStatus(message) },
      );
    }

    return NextResponse.json(rpcResult.data ?? { ok: true });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Unexpected approval error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
