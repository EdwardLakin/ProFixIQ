import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stringIds(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = [...new Set(value.map((item) => String(item).trim()))];
  return ids.every((id) => UUID_PATTERN.test(id)) ? ids : null;
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) return access.response;

  const { id: rawId } = await context.params;
  const workOrderId = rawId.trim();
  if (!UUID_PATTERN.test(workOrderId)) {
    return NextResponse.json(
      { error: "Invalid work order id." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const quoteLineIds = stringIds(body?.quoteLineIds);
  if (quoteLineIds == null) {
    return NextResponse.json(
      { error: "Quote line ids must be valid UUIDs." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "apply_customer_pricing_v2_to_quote_atomic" as never,
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: workOrderId,
      p_quote_line_ids: quoteLineIds,
      p_actor_user_id: access.authUserId,
      p_at: new Date().toISOString(),
    } as never,
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const status = message.includes("not found")
      ? 404
      : message.includes("LOCKED") || message.includes("protected")
        ? 409
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  return NextResponse.json(
    data && typeof data === "object" ? data : { ok: true },
  );
}
