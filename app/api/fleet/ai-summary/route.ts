// app/api/fleet/ai-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { openai } from "lib/server/openai";

type DB = Database;

const MODEL =
  process.env.OPENAI_MODEL?.trim() || "gpt-5.1-mini";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { shopId: explicitShopId } = (await req.json().catch(() => ({}))) as {
    shopId?: string | null;
  };

  // Resolve shop: explicit > derived from profile
  let shopId = explicitShopId ?? null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!shopId) {
    if (!user) {
      return NextResponse.json(
        { error: "shopId required when not authenticated." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.shop_id) {
      return NextResponse.json(
        { error: "Unable to resolve shop for user." },
        { status: 400 },
      );
    }
    shopId = profile.shop_id;
  }

  // Look back 30 days (tune as needed)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Pull pre-trip data
  const { data: pretrips, error: pretripError } = await supabase
    .from("fleet_pretrip_reports")
    .select(
      "vehicle_id, driver_name, inspection_date, has_defects, checklist, notes",
    )
    .eq("shop_id", shopId)
    .gte("inspection_date", thirtyDaysAgo.toISOString().slice(0, 10));

  if (pretripError) {
    console.error("Pretrip query error:", pretripError);
    return NextResponse.json(
      { error: "Failed to load fleet pre-trip data." },
      { status: 500 },
    );
  }

  // Pull work order / inspection signal for “what techs actually found”
  const { data: workOrders, error: woError } = await supabase
    .from("work_orders")
    .select("id, vehicle_id, status, created_at, completed_at")
    .eq("shop_id", shopId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (woError) {
    console.error("Work order query error:", woError);
    return NextResponse.json(
      { error: "Failed to load work order data." },
      { status: 500 },
    );
  }

  const { data: inspections, error: inspError } = await supabase
    .from("inspections")
    .select("id, work_order_line_id, status, created_at")
    .eq("shop_id", shopId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (inspError) {
    console.error("Inspection query error:", inspError);
    return NextResponse.json(
      { error: "Failed to load inspection data." },
      { status: 500 },
    );
  }

  // Build a compact context object
  const context = {
    windowDays: 30,
    pretrips: pretrips ?? [],
    workOrders: workOrders ?? [],
    inspections: inspections ?? [],
  };

  // Ask OpenAI for a manager-grade fleet summary
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are an expert fleet maintenance analyst.",
          "You summarize HD fleet health for dispatchers and maintenance managers.",
          "Use clear, practical language. Focus on trends, risk, and next actions.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          "Using the JSON I’m giving you, summarize the fleet’s health for the last 30 days.",
          "",
          "Highlight:",
          "- Units with repeated pre-trip defects.",
          "- Drivers that repeatedly mark everything OK but later inspections/work orders show failures.",
          "- Any units at higher risk of breakdown or compliance issues.",
          "- Simple, concrete next actions for dispatch and maintenance planning.",
          "",
          "JSON data:",
          "```json",
          JSON.stringify(context),
          "```",
        ].join("\n"),
      },
    ],
  });

  const summary = completion.choices[0]?.message?.content?.trim() || "";

  return NextResponse.json(
    {
      summary,
      lastUpdated: new Date().toISOString(),
    },
    { status: 200 },
  );
}