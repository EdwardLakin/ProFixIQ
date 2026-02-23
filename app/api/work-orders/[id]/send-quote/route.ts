// /app/api/work-orders/[id]/send-quote/route.ts (FULL FILE)
// Wrapper route so legacy UI calls keep working.
// Forwards request to /api/quotes/send with workOrderId = params.id.

import { NextResponse } from "next/server";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

type ForwardBody = {
  workOrderId: string;
  customerEmail?: string;
  quoteTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: Array<{ description: string; amount: number }>;
  vehicleInfo?: { year?: string | number | null; make?: string | null; model?: string | null };
  pdfUrl?: string | null;
};

export async function POST(
  req: Request,
  ctx: { params: { id?: string } },
) {
  const id = ctx.params?.id ?? "";
  const trace = `wo-send-quote:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  // 🔥 If you don’t see this in Vercel logs, you are NOT running this route.
  console.log(`[send-quote wrapper] HIT trace=${trace} id=${id}`);

  if (!id || !isUuid(id)) {
    console.log(`[send-quote wrapper] BAD_ID trace=${trace} id=${id}`);
    return NextResponse.json(
      {
        ok: false,
        trace,
        error: "Invalid work order id (expected UUID in URL).",
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
    workOrderId: id, // ✅ FORCE UUID from URL (prevents custom_id mistakes)
  };

  // Forward to /api/quotes/send (same deployment)
  const url = new URL(req.url);
  url.pathname = "/api/quotes/send";
  url.search = "";

  console.log(`[send-quote wrapper] FORWARD trace=${trace} -> ${url.pathname}`);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // helpful to see in logs downstream (if you log it there too)
      "x-profix-trace": trace,
    },
    body: JSON.stringify(forwardBody),
    cache: "no-store",
  });

  const text = await res.text();
  console.log(
    `[send-quote wrapper] RESULT trace=${trace} status=${res.status} body=${text.slice(
      0,
      500,
    )}`,
  );

  // Pass-through response but add trace so client can show it
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-profix-trace": trace,
    },
  });
}