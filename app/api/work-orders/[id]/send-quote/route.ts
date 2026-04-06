// /app/api/work-orders/[id]/send-quote/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function resolveWorkOrderId(rawId: string): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;
  if (isUuid(id)) return id;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) return null;

  const sb = createClient<DB>(url, key);

  const { data, error } = await sb
    .from("work_orders")
    .select("id")
    .eq("custom_id", id)
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

  const resolvedId = await resolveWorkOrderId(id);

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
  url.pathname = "/api/quotes/send";
  url.search = "";

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-profix-trace": trace,
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
