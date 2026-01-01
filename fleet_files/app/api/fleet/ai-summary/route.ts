// app/api/fleet/ai-summary/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { openai } from "lib/server/openai";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type FleetPretripRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type FleetDispatchRow =
  DB["public"]["Tables"]["fleet_dispatch_assignments"]["Row"];

export type SummaryResponse = {
  summary: string;
  lastUpdated?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabaseUser = createRouteHandlerClient<DB>({ cookies });
    const supabaseAdmin = createAdminSupabase();

    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let bodyShopId: string | null = null;
    try {
      const body = (await req.json().catch(() => null)) as
        | { shopId?: string | null }
        | null;
      if (body?.shopId && typeof body.shopId === "string") {
        bodyShopId = body.shopId;
      }
    } catch {
      // ignore bad JSON
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("shop_id")
      .eq("user_id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileErr) {
      console.error("[fleet/ai-summary] profile error:", profileErr);
      return NextResponse.json(
        { error: "Could not resolve shop for current user." },
        { status: 400 },
      );
    }

    const shopId = (bodyShopId ?? (profile?.shop_id as string | null)) ?? null;

    if (!shopId) {
      return NextResponse.json(
        { error: "No shop associated with current user." },
        { status: 400 },
      );
    }

    const now = new Date();
    const lookbackDays = 30;
    const since = new Date(
      now.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [serviceRes, pretripRes, dispatchRes] = await Promise.all([
      supabaseAdmin
        .from("fleet_service_requests")
        .select("*")
        .eq("shop_id", shopId)
        .gte("created_at", since),
      supabaseAdmin
        .from("fleet_pretrip_reports")
        .select("*")
        .eq("shop_id", shopId)
        .gte("inspection_date", since),
      supabaseAdmin
        .from("fleet_dispatch_assignments")
        .select("*")
        .eq("shop_id", shopId)
        .gte("created_at", since),
    ]);

    if (serviceRes.error) {
      console.error(
        "[fleet/ai-summary] service requests error:",
        serviceRes.error,
      );
    }
    if (pretripRes.error) {
      console.error("[fleet/ai-summary] pretrips error:", pretripRes.error);
    }
    if (dispatchRes.error) {
      console.error("[fleet/ai-summary] dispatch error:", dispatchRes.error);
    }

    const serviceRequests =
      (serviceRes.data as FleetServiceRequestRow[] | null) ?? [];
    const pretrips = (pretripRes.data as FleetPretripRow[] | null) ?? [];
    const dispatchAssignments =
      (dispatchRes.data as FleetDispatchRow[] | null) ?? [];

    const openService = serviceRequests.filter(
      (r) => (r.status as string | null) !== "completed",
    );
    const safetyIssues = openService.filter(
      (r) => (r.severity as string | null) === "safety",
    );
    const complianceIssues = openService.filter(
      (r) => (r.severity as string | null) === "compliance",
    );

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const pretripsToday = pretrips.filter((p) => {
      if (!p.inspection_date) return false;
      const d = new Date(p.inspection_date as string);
      return d >= todayStart && d < todayEnd;
    });

    const driversWithAssignments = new Set(
      dispatchAssignments
        .map((d) => d.driver_profile_id as string | null)
        .filter(Boolean) as string[],
    );

    const sampleIssues = openService.slice(0, 5).map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      severity: r.severity,
      status: r.status,
      scheduled_for_date: r.scheduled_for_date,
    }));

    const stats = {
      total_open: openService.length,
      safety_open: safetyIssues.length,
      compliance_open: complianceIssues.length,
      pretrips_last_30_days: pretrips.length,
      pretrips_today: pretripsToday.length,
      active_drivers_with_assignments: driversWithAssignments.size,
      lookback_days: lookbackDays,
    };

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    let summaryText =
      "Fleet data loaded, but AI summary not available. " +
      `Open issues: ${stats.total_open}, safety: ${stats.safety_open}, ` +
      `compliance: ${stats.compliance_open}, pre-trips in last ${stats.lookback_days} days: ${stats.pretrips_last_30_days}.`;

    try {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: [
              "You are an expert HD fleet maintenance coordinator.",
              "You speak directly to shop owners in 3–6 concise bullet points.",
              "Your job is to summarize fleet health and highlight:",
              "- safety-critical items",
              "- compliance risk",
              "- pre-trip and driver behaviour",
              "- what should be done in the next 24–72 hours.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              stats,
              sampleIssues,
            }),
          },
        ],
      });

      const content =
        completion.choices[0]?.message?.content?.toString().trim();
      if (content) {
        summaryText = content;
      }
    } catch (err) {
      console.error("[fleet/ai-summary] openai error:", err);
      // fall back to non-AI summaryText
    }

    const payload: SummaryResponse = {
      summary: summaryText,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[fleet/ai-summary] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to generate fleet summary." },
      { status: 500 },
    );
  }
}