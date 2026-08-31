// app/api/work-orders/quotes/[id]/authorize/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { applyWorkOrderQuoteLineDecision } from "@/features/work-orders/server/workOrderQuoteLineApproval";
import type {
  QuoteApprovalDecision,
  QuoteDecisionContactMethod,
} from "@/features/work-orders/server/workOrderQuoteLineApproval";

export const runtime = "nodejs";

const DECISIONS = new Set<QuoteApprovalDecision>([
  "approve",
  "decline",
  "defer",
]);
const CONTACT_METHODS = new Set<QuoteDecisionContactMethod>([
  "phone",
  "in_person",
  "email",
  "other",
]);

export async function POST(req: NextRequest) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canAuthorizeQuotes",
      requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
    });
    if (!access.ok) return access.response;
    const supabase = access.supabase;

    // Extract `[id]` from the pathname .../quotes/<id>/authorize
    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2];

    if (!id) {
      return NextResponse.json(
        { error: "Missing quote line id" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const decisionValue = String(body.decision ?? "approve")
      .trim()
      .toLowerCase();
    const contactValue = String(body.contactMethod ?? "other")
      .trim()
      .toLowerCase();
    if (!DECISIONS.has(decisionValue as QuoteApprovalDecision)) {
      return NextResponse.json(
        { error: "Unsupported quote decision" },
        { status: 400 },
      );
    }
    if (!CONTACT_METHODS.has(contactValue as QuoteDecisionContactMethod)) {
      return NextResponse.json(
        { error: "Unsupported contact method" },
        { status: 400 },
      );
    }
    const decision = decisionValue as QuoteApprovalDecision;
    const contactMethod = contactValue as QuoteDecisionContactMethod;
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null;
    const operationKey =
      typeof body.operationKey === "string"
        ? body.operationKey.trim().slice(0, 160)
        : undefined;

    const { data: q, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select("id, shop_id, work_order_id, work_order_line_id")
      .eq("id", id)
      .single();

    if (qErr || !q) {
      return NextResponse.json(
        { error: "Quote line not found" },
        { status: 404 },
      );
    }

    if (!q.shop_id) {
      return NextResponse.json(
        { error: "Quote line is missing shop_id" },
        { status: 400 },
      );
    }
    if (q.shop_id !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const authority = await resolveWorkOrderProductAuthority(
      access,
      q.work_order_id,
    );
    if (!authority.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await applyWorkOrderQuoteLineDecision({
      supabase,
      quoteLineIds: [q.id],
      workOrderId: q.work_order_id,
      shopId: q.shop_id,
      customerId: null,
      actorUserId: access.authUserId,
      decision,
      decisionSource: "shop",
      contactMethod,
      decisionNote: note,
      operationKey,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          expired: result.expired === true,
          error: result.error ?? "Failed to authorize quote line",
        },
        { status: result.expired || result.pricingQuarantined ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      workOrderLineId:
        result.workOrderLineIds[0] ?? q.work_order_line_id ?? null,
      workOrderLineIds: result.workOrderLineIds,
      approvalState: result.approvalState,
      decision,
      partRelink: result.partRelink,
    });
  } catch {
    return NextResponse.json({ error: "Failed to authorize" }, { status: 500 });
  }
}
