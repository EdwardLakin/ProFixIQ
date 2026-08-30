import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
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
};
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type StaffDecisionActor = {
  kind: "staff";
  shopId: string;
  profileId: string;
};

type PortalDecisionActor = {
  kind: "portal";
  shopId: string;
  customerId: string;
  userId: string;
};

type DecisionActor = StaffDecisionActor | PortalDecisionActor;

const STAFF_APPROVAL_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

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
  if (lower.includes("locked") || lower.includes("no longer eligible")) return 409;
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

    // The same UI action is used by Shop staff and by the Customer Portal. The
    // old route always forced the caller through requirePortalCustomerActor,
    // which made legitimate owner/admin/manager/advisor actions fail unless the
    // staff account also happened to be a portal customer. Resolve canonical
    // staff identity first; only a caller with no staff profile uses the portal
    // authorization path.
    const { profile, error: profileError } = await resolveAuthenticatedStaffProfile(
      supabase,
      user.id,
    );
    if (profileError) {
      return NextResponse.json({ ok: false, error: profileError }, { status: 403 });
    }

    let actor: DecisionActor;
    if (profile?.shop_id) {
      const canonicalRole = canonicalizeRole(profile.role);
      if (!STAFF_APPROVAL_ROLES.has(canonicalRole)) {
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
        profileId: profile.id,
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

    const quarantineCheck = await checkQuotePricingQuarantine({
      supabase,
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
      const { data: currentLine, error: currentLineError } = await supabase
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

    const rpc = supabase as unknown as RpcClient;
    const rpcResult =
      actor.kind === "staff"
        ? await rpc.rpc("apply_approval_compatibility_bundle_atomic", {
            p_shop_id: actor.shopId,
            p_work_order_id: workOrderId,
            p_customer_id: null,
            p_actor_user_id: actor.profileId,
            p_approved_line_ids: decision === "approve" ? [lineId] : [],
            p_declined_line_ids: decision === "decline" ? [lineId] : [],
            p_approved_quote_line_ids: [],
            p_declined_quote_line_ids: [],
            p_signature_url: null,
            p_operation_key: `${actor.shopId}:staff-line-decision:${key}`,
            p_at: new Date().toISOString(),
          })
        : await rpc.rpc("apply_portal_line_decision_atomic", {
            p_shop_id: actor.shopId,
            p_customer_id: actor.customerId,
            p_work_order_id: workOrderId,
            p_line_id: lineId,
            p_actor_user_id: actor.userId,
            p_decision: decision,
            p_operation_key: `${actor.shopId}:portal-line-decision:${key}`,
            p_at: new Date().toISOString(),
          });

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
