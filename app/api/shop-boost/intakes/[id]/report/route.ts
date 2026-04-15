import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });

  const admin = createAdminSupabase() as any;
  const { data: intake, error } = await admin
    .from("shop_boost_intakes")
    .select("id,shop_id,status,created_at,processed_at,intake_basics")
    .eq("id", params.id)
    .eq("shop_id", profile.shop_id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!intake) return NextResponse.json({ ok: false, error: "Intake not found." }, { status: 404 });

  const basics = asRecord(intake.intake_basics);
  const migrationProgress = asRecord(basics.migrationProgress);
  const importSummary = asRecord(basics.importSummary);
  const integrity = asRecord(importSummary.integrity ?? migrationProgress.integrity);

  const [{ data: reviewRows }, { data: byDomainRows }] = await Promise.all([
    admin
      .from("shop_boost_review_items")
      .select("status,resolution_action")
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", params.id),
    admin
      .from("shop_boost_row_results")
      .select("domain,review_required,error_reason")
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", params.id),
  ]);

  const reviewOutcomes = (reviewRows ?? []).reduce((acc: Record<string, number>, row: Record<string, unknown>) => {
    const status = String(row.status ?? "unknown");
    acc[`status:${status}`] = (acc[`status:${status}`] ?? 0) + 1;
    const action = String(row.resolution_action ?? "none");
    acc[`action:${action}`] = (acc[`action:${action}`] ?? 0) + 1;
    return acc;
  }, {});

  const domainSummaries = (byDomainRows ?? []).reduce((acc: Record<string, { review: number; failed: number; processed: number }>, row: Record<string, unknown>) => {
    const key = String(row.domain ?? "unknown");
    const next = acc[key] ?? { review: 0, failed: 0, processed: 0 };
    next.processed += 1;
    if (row.review_required) next.review += 1;
    if (row.error_reason) next.failed += 1;
    acc[key] = next;
    return acc;
  }, {});

  const report = {
    intake_id: intake.id,
    status: intake.status,
    created_at: intake.created_at,
    processed_at: intake.processed_at,
    migration_story: asRecord(basics.migration_story),
    domain_summaries: domainSummaries,
    integrity_results: {
      status: integrity.status ?? null,
      checks: asRecord(integrity.checks),
      integrity_errors: Array.isArray((integrity as any).integrity_errors) ? (integrity as any).integrity_errors : [],
    },
    review_outcomes: reviewOutcomes,
  };

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  if (download) {
    return new NextResponse(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=\"shop-boost-report-${intake.id}.json\"`,
      },
    });
  }

  return NextResponse.json({ ok: true, report });
}
