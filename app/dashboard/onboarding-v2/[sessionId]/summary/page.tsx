import Link from "next/link";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import RunAnalysisButton from "./RunAnalysisButton";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { filterGuidedAnalysisRecommendations } from "@/features/onboarding-v2/analysis/filterGuidedAnalysisRecommendations";
import type { AiRecommendationRecord } from "@/features/ai/server/types";
import type { Json } from "@shared/types/types/supabase";

type Props = {
  params: Promise<{ sessionId: string }>;
};

type GuidedSessionRow = {
  id: string;
  shop_id: string;
};

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseSelectQuery<T> = {
  select(columns: string): SupabaseSelectQuery<T>;
  eq(column: string, value: string): SupabaseSelectQuery<T>;
  in(column: string, values: string[]): SupabaseSelectQuery<T>;
  order(column: string, options: { ascending: boolean }): SupabaseSelectQuery<T>;
  limit(count: number): Promise<SupabaseQueryResult<T[]>>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
};

type GuidedAnalysisSupabaseReader = {
  from<T>(table: string): SupabaseSelectQuery<T>;
};

const GUIDED_ANALYSIS_CATEGORIES = [
  ["1", "Inspection templates first", "Recommend inspection templates that match the shop's vehicle mix, common jobs, and inspection goals before building canned services."],
  ["2", "Menu items and canned services second", "Recommend menu items after inspection guidance, because canned services can attach inspections."],
  ["3", "Inventory improvements", "Flag fast-moving parts, missing stock coverage, reorder opportunities, and cleanup candidates."],
  ["4", "Vendor suggestions", "Identify vendor gaps or consolidation opportunities from configured parts and invoice patterns."],
  ["5", "Customer and fleet segments", "Suggest segments for retention, fleet handling, declined work follow-up, and targeted communication."],
  ["6", "Maintenance packages", "Recommend packages that align with shop history, vehicle types, and recurring mileage or time intervals."],
  ["7", "Automation rules", "Suggest reminders, review prompts, approval follow-ups, and internal workflow automations for owner review."],
] as const;

function jsonHasContent(value: Json | null | undefined): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

async function loadGuidedAnalysisRecommendations(sessionId: string): Promise<AiRecommendationRecord[]> {
  const { profile } = await requireAdminPageAccess({ allow: ["owner", "admin", "manager", "advisor"] });
  const supabase = createServerSupabaseRSC();
  const reader = supabase as unknown as GuidedAnalysisSupabaseReader;
  const shopId = profile.shop_id!;

  await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });

  const { data: session, error: sessionError } = await reader
    .from<GuidedSessionRow>("guided_onboarding_sessions")
    .select("id, shop_id")
    .eq("id", sessionId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (sessionError) throw new Error(sessionError.message);
  if (!session) return [];
  const guidedSession = session as GuidedSessionRow;

  const { data, error } = await reader
    .from<AiRecommendationRecord>("ai_recommendations")
    .select("*")
    .eq("shop_id", shopId)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return filterGuidedAnalysisRecommendations((data ?? []) as AiRecommendationRecord[], guidedSession.id);
}

function formatConfidence(confidence: number | null) {
  if (confidence == null) return "Not scored";
  return `${Math.round(confidence * 100)}%`;
}

export default async function GuidedOnboardingAnalysisSummaryPage({ params }: Props) {
  const { sessionId } = await params;
  const recommendations = await loadGuidedAnalysisRecommendations(sessionId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-10 pt-6 text-neutral-100 sm:px-6 lg:px-8">
      <GuidedPageStepPanel />
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Guided Setup · AI Business Analysis</p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Review recommended launch improvements</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
          ProFixIQ AI Business Analysis reviews the customers, vehicles, history, invoices, parts, and shop defaults that were imported or configured during guided setup. It recommends next actions for the shop; it does not auto-create operational records.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <RunAnalysisButton sessionId={sessionId} hasRecommendations={recommendations.length > 0} />
          <Link href="/dashboard/ai-recommendations" className="rounded-full border border-orange-300/35 bg-orange-300/10 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-300/20">
            Open AI Recommendations
          </Link>
          <p className="text-xs text-neutral-500">Session: {sessionId}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {GUIDED_ANALYSIS_CATEGORIES.map(([index, title, description]) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-black/35 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.30)] backdrop-blur-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-orange-300/30 bg-orange-300/10 text-sm font-semibold text-orange-100">{index}</span>
            <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.30)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Current recommendations</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Reviewable AI Business Analysis signals</h2>
          </div>
          <Link href="/dashboard/ai-recommendations" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
            Review in AI Recommendations
          </Link>
        </div>

        {recommendations.length > 0 ? (
          <div className="mt-5 space-y-4">
            {recommendations.map((recommendation) => (
              <article key={recommendation.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{recommendation.title}</h3>
                    {recommendation.summary ? <p className="mt-2 text-sm leading-6 text-neutral-300">{recommendation.summary}</p> : null}
                  </div>
                  <Link href="/dashboard/ai-recommendations" className="shrink-0 rounded-full border border-orange-300/30 bg-orange-300/10 px-3 py-1.5 text-xs font-semibold text-orange-100 transition hover:bg-orange-300/20">
                    Review in AI Recommendations
                  </Link>
                </div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Domain", recommendation.domain],
                    ["Type", recommendation.recommendation_type],
                    ["Priority", recommendation.priority],
                    ["Confidence", formatConfidence(recommendation.confidence)],
                    ["Risk", recommendation.risk_tier],
                    ["Status", recommendation.status],
                    ["Missing data", jsonHasContent(recommendation.missing_data) ? "Yes" : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <dt className="uppercase tracking-[0.16em] text-neutral-500">{label}</dt>
                      <dd className="mt-1 font-semibold text-neutral-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm leading-6 text-neutral-300">
            No AI Business Analysis has been generated yet. Your imported onboarding data is ready. The next step will run analysis and create reviewable recommendations.
          </div>
        )}
      </section>
    </main>
  );
}
