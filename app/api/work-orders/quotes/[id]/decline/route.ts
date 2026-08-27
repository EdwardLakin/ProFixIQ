import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { applyWorkOrderQuoteLineDecision } from "@/features/work-orders/server/workOrderQuoteLineApproval";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canAuthorizeQuotes",
      requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
    });
    if (!access.ok) return access.response;
    const supabase = access.supabase;

    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2];

    if (!id) {
      return NextResponse.json(
        { error: "Missing quote line id" },
        { status: 400 },
      );
    }

    const { data: q, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select("id,shop_id,work_order_id")
      .eq("id", id)
      .single();

    if (qErr || !q) {
      return NextResponse.json(
        { error: "Quote line not found" },
        { status: 404 },
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

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = await applyWorkOrderQuoteLineDecision({
      supabase,
      quoteLineIds: [q.id],
      workOrderId: q.work_order_id,
      shopId: q.shop_id,
      customerId: null,
      actorUserId: access.authUserId,
      decision: "decline",
      decisionSource: "shop",
      contactMethod: "other",
      decisionNote:
        typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null,
      operationKey:
        typeof body.operationKey === "string"
          ? body.operationKey.trim().slice(0, 160)
          : undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          expired: result.expired === true,
          error: result.error ?? "Failed to decline quote",
        },
        { status: result.expired || result.pricingQuarantined ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      approvalState: result.approvalState,
      idempotent: result.idempotent === true,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to decline quote" },
      { status: 500 },
    );
  }
}
