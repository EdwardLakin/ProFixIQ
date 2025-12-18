// app/api/portal/request/ai/similar-labor/route.ts
//
// Goal: given (shop + vehicle context + complaint), return a suggested labor_hours + confidence
// Uses existing data first (shop work_order_lines / menu_items / pricing history).
//
// NOTE: This is a safe, internal-first baseline. We can later swap in embeddings via ai_training_data
// once you confirm your existing vector setup and OpenAI helper path.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderId: string;
  complaint: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return bad("Not authenticated", 401);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Invalid JSON body");
    }

    const workOrderId = (body?.workOrderId ?? "").trim();
    const complaint = (body?.complaint ?? "").trim();

    if (!workOrderId || !complaint) return bad("Missing workOrderId or complaint");

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, customer_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    // Pull a small sample of similar historical lines for this shop
    const q = norm(complaint);

    const { data: recentLines } = await supabase
      .from("work_order_lines")
      .select("id, complaint, labor_time, created_at")
      .eq("shop_id", wo.shop_id)
      .not("labor_time", "is", null)
      .order("created_at", { ascending: false })
      .limit(150);

    const lines = Array.isArray(recentLines) ? recentLines : [];

    const scored = lines
      .map((l) => {
        const text = norm((l.complaint ?? "") as string);
        const hit = text.includes(q) || q.includes(text);
        const overlap =
          text.length > 0 && q.length > 0
            ? Math.min(
                1,
                text.split(" ").filter((w) => q.split(" ").includes(w)).length / 6,
              )
            : 0;

        const score = (hit ? 0.7 : 0) + overlap;
        const labor = typeof l.labor_time === "number" ? l.labor_time : null;
        return { score, labor };
      })
      .filter((x) => x.labor != null && x.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (scored.length === 0) {
      return NextResponse.json(
        { laborHours: null, confidence: 0, source: "none" },
        { status: 200 },
      );
    }

    // Weighted average
    let wSum = 0;
    let lwSum = 0;
    for (const s of scored) {
      const w = Math.max(0.1, Math.min(1, s.score));
      wSum += w;
      lwSum += w * (s.labor as number);
    }

    const laborHours = wSum > 0 ? Math.round((lwSum / wSum) * 10) / 10 : null;
    const confidence = Math.max(0.2, Math.min(0.85, scored[0].score));

    return NextResponse.json(
      { laborHours, confidence, source: "shop_history" },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("similar-labor error:", msg);
    return bad("Unexpected error", 500);
  }
}
