// /app/api/work-orders/[id]/send-quote/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

async function resolveWorkOrderId(
  rawId: string,
  shopId: string,
  accessSupabase: ReturnType<typeof createServerSupabaseRoute>,
): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;
  const { data, error } = await accessSupabase
    .from("work_orders")
    .select("id")
    .eq("shop_id", shopId)
    .or(`id.eq.${id},custom_id.eq.${id}`)
    .maybeSingle<{ id: string }>();

  if (error) return null;
  return data?.id ?? null;
}

type ForwardBody = {
  workOrderId: string;
  customerEmail?: string;
  quoteTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: Array<{ description: string; amount: number }>;
  vehicleInfo?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
  };
  pdfUrl?: string | null;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const trace = `wo-send-quote:${Date.now()}:${Math.random()
    .toString(16)
    .slice(2)}`;

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) {
    const payload = await access.response.json().catch(() => ({ error: "Forbidden" }));
    return NextResponse.json(
      { ok: false, trace, error: payload?.error ?? "Forbidden" },
      { status: access.response.status },
    );
  }
  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json({ ok: false, trace, error: "Profile for current user not found" }, { status: 403 });
  }

  const resolvedId = await resolveWorkOrderId(id, shopId, access.supabase);

  if (!resolvedId) {
    return NextResponse.json(
      {
        ok: false,
        trace,
        error: "Invalid work order id. Expected UUID or existing custom_id.",
        received: id,
        route: "/api/work-orders/[id]/send-quote",
      },
      { status: 400 },
    );
  }

  let body: Partial<ForwardBody> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Partial<ForwardBody>;
  } catch {
    body = {};
  }

  const forwardBody: ForwardBody = {
    ...body,
    workOrderId: resolvedId,
  };

  const url = new URL(req.url);
  // Compatibility wrapper: canonical quote send behavior lives at /api/quotes/send.
  url.pathname = "/api/quotes/send";
  url.search = "";

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-profix-trace": trace,
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(forwardBody),
    cache: "no-store",
  });

  const text = await res.text();

  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-profix-trace": trace,
    },
  });
}
