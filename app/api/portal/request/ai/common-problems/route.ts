// app/api/portal/request/ai/common-problems/route.ts
//
// Vehicle-context "common issues for complaint" baseline.
// For now: internal-only (uses your own historical lines). Later we can add web search + citations
// via your existing AI layer once you confirm the exact server OpenAI helper + allowed egress.
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

type Suggestion = {
  title: string;
  why: string;
  confidence: number; // 0..1
};

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

    const q = norm(complaint);

    const { data: lines } = await supabase
      .from("work_order_lines")
      .select("complaint, cause, correction, created_at")
      .eq("shop_id", wo.shop_id)
      .order("created_at", { ascending: false })
      .limit(250);

    const rows = Array.isArray(lines) ? lines : [];

    const hits = rows
      .map((r) => {
        const c = norm((r.complaint ?? "") as string);
        const score = c.includes(q) ? 1 : q.split(" ").some((w) => c.includes(w)) ? 0.35 : 0;
        const title = ((r.cause ?? r.correction ?? r.complaint) as string | null) ?? "";
        return { score, title: title.trim() };
      })
      .filter((x) => x.score > 0 && x.title.length > 0)
      .slice(0, 50);

    const counts = new Map<string, number>();
    for (const h of hits) counts.set(h.title, (counts.get(h.title) ?? 0) + 1);

    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const suggestions: Suggestion[] = sorted.map(([title, n], idx) => {
      const base = Math.max(0.25, Math.min(0.8, n / 10));
      const confidence = Math.max(0.2, Math.min(0.85, base - idx * 0.05));
      return {
        title,
        why: "Based on similar past repairs at this shop.",
        confidence,
      };
    });

    return NextResponse.json(
      { suggestions, source: "shop_history" },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("common-problems error:", msg);
    return bad("Unexpected error", 500);
  }
}
