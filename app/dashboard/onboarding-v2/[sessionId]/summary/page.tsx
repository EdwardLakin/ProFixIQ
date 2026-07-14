import Link from "next/link";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import RunAnalysisButton from "./RunAnalysisButton";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { filterGuidedAnalysisRecommendations } from "@/features/onboarding-v2/analysis/filterGuidedAnalysisRecommendations";
import { buildExecutiveSummary } from "@/features/onboarding-v2/analysis/buildExecutiveSummary";
import { collectGuidedOnboardingEvidence, type GuidedOnboardingEvidence } from "@/features/onboarding-v2/analysis/server";
import type { AiRecommendationRecord } from "@/features/ai/server/types";

type Props = { params: Promise<{ sessionId: string }> };
type GuidedSessionRow = { id: string; shop_id: string };
type SupabaseQueryResult<T> = { data: T | null; error: { message: string } | null };
type SupabaseSelectQuery<T> = { select(columns: string): SupabaseSelectQuery<T>; eq(column: string, value: string): SupabaseSelectQuery<T>; in(column: string, values: string[]): SupabaseSelectQuery<T>; order(column: string, options: { ascending: boolean }): SupabaseSelectQuery<T>; limit(count: number): Promise<SupabaseQueryResult<T[]>>; maybeSingle(): Promise<SupabaseQueryResult<T>> };
type GuidedAnalysisSupabaseReader = { from<T>(table: string): SupabaseSelectQuery<T> };

type SummaryData = { recommendations: AiRecommendationRecord[]; evidence: GuidedOnboardingEvidence | null };

async function loadGuidedAnalysisSummaryData(sessionId: string): Promise<SummaryData> {
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
  if (!session) return { recommendations: [], evidence: null };

  const [{ data, error }, evidence] = await Promise.all([
    reader
      .from<AiRecommendationRecord>("ai_recommendations")
      .select("*")
      .eq("shop_id", shopId)
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(100),
    collectGuidedOnboardingEvidence(supabase, shopId),
  ]);

  if (error) throw new Error(error.message);
  return { recommendations: filterGuidedAnalysisRecommendations((data ?? []) as AiRecommendationRecord[], session.id), evidence };
}

function formatCount(value: number) { return new Intl.NumberFormat("en-US").format(value); }
function impactClass(impact: "high" | "medium" | "low") {
  if (impact === "high") return "border-orange-300/40 bg-orange-300/15 text-orange-100";
  if (impact === "medium") return "border-sky-300/35 bg-sky-300/10 text-sky-100";
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]";
}

export default async function GuidedOnboardingAnalysisSummaryPage({ params }: Props) {
  const { sessionId } = await params;
  const { recommendations, evidence } = await loadGuidedAnalysisSummaryData(sessionId);
  const hasAnalysis = recommendations.length > 0 && evidence != null;
  const summary = hasAnalysis ? buildExecutiveSummary(evidence, recommendations) : null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-10 pt-6 text-[color:var(--theme-text-primary)] sm:px-6 lg:px-8">
      <GuidedPageStepPanel />
      <section className="overflow-hidden rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-200/85">Guided Setup · AI Executive Summary</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <h1 className="text-3xl font-semibold text-[color:var(--theme-text-primary)] sm:text-5xl">{hasAnalysis ? "Your business analysis is ready." : "Run your AI Business Analysis."}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)] sm:text-base">
              {hasAnalysis ? "ProFixIQ reviewed the information imported during guided setup. Here is what your data says about your shop and where the platform can help first." : "ProFixIQ will review customers, vehicles, service history, invoices, parts, vendors, inspection templates, menu items, and shop defaults. It creates owner-reviewable recommendations only; it does not auto-create operational records."}
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
            {summary ? <><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Launch Readiness</p><div className="flex items-end gap-3"><span className="text-5xl font-semibold text-[color:var(--theme-text-primary)]">{summary.readiness.score}</span><span className="pb-2 text-lg text-[color:var(--theme-text-secondary)]">/100</span></div><p className="font-semibold text-orange-100">{summary.readiness.label}</p><p className="text-xs leading-5 text-[color:var(--theme-text-secondary)]">{summary.readiness.summary}</p></> : <><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Launch Readiness</p><p className="text-sm leading-6 text-[color:var(--theme-text-secondary)]">No readiness score is shown until analysis has been run against the current onboarding data.</p></>}
            <RunAnalysisButton sessionId={sessionId} hasRecommendations={recommendations.length > 0} />
          </div>
        </div>
      </section>

      {summary ? (
        <>
          <section className="rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Business snapshot</p>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">ProFixIQ analyzed your business, not just your setup form.</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Customers", summary.analyzed.customers], ["Vehicles", summary.analyzed.vehicles], ["Service-history records", summary.analyzed.historyRecords], ["Historical invoices", summary.analyzed.invoices], ["Parts", summary.analyzed.parts], ...(summary.analyzed.vendors != null ? [["Vendors", summary.analyzed.vendors] as const] : []), ...(summary.analyzed.yearsOfHistory != null ? [["Years of history", summary.analyzed.yearsOfHistory] as const] : [])].map(([label, value]) => <div key={label} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"><p className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{label}</p><p className="mt-2 text-3xl font-semibold text-[color:var(--theme-text-primary)]">{formatCount(Number(value))}</p></div>)}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">AI Executive Summary</p><h2 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{summary.shopProfile.headline}</h2><p className="mt-3 text-sm leading-6 text-[color:var(--theme-text-secondary)]">{summary.shopProfile.description}</p><p className="mt-4 text-sm leading-6 text-[color:var(--theme-text-secondary)]">{summary.closingSummary}</p></article>
            <article className="rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">What ProFixIQ learned</p><div className="mt-4 space-y-3">{summary.strengths.length > 0 ? summary.strengths.map((item) => <div key={item.title} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4"><h3 className="font-semibold text-[color:var(--theme-text-primary)]">{item.title}</h3><p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">{item.description}</p></div>) : <p className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm leading-6 text-[color:var(--theme-text-secondary)]">There is not enough imported evidence yet to identify a clear strength. Add more setup data and re-run analysis.</p>}</div></article>
          </section>

          <section className="rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">What we noticed</p><div className="mt-4 grid gap-3 md:grid-cols-2">{summary.observations.map((item) => <article key={item.title} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"><h3 className="font-semibold text-[color:var(--theme-text-primary)]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">{item.description}</p>{item.supportingMetric ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/70">{item.supportingMetric}</p> : null}</article>)}</div></section>

          <section className="rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Highest-impact opportunities</p><h2 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">Start with the next few owner-reviewed decisions.</h2></div><Link href="/dashboard/ai-recommendations" className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]">Review All AI Recommendations</Link></div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">{summary.priorities.map((priority) => <article key={priority.recommendationId ?? priority.title} className="flex flex-col rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5"><div className="flex items-center justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-300/30 bg-orange-300/10 font-semibold text-orange-100">{priority.rank}</span><span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${impactClass(priority.impact)}`}>{priority.impact} impact</span></div><p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{priority.category}</p><h3 className="mt-2 text-lg font-semibold text-[color:var(--theme-text-primary)]">{priority.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">{priority.description}</p><Link href="/dashboard/ai-recommendations" className="mt-4 rounded-full border border-orange-300/30 bg-orange-300/10 px-4 py-2 text-center text-sm font-semibold text-orange-100 transition hover:bg-orange-300/20">Review recommendation</Link></article>)}</div>
          </section>

          <section className="flex flex-col gap-3 rounded-[2rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">Ready for the next step?</h2><p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Continue activation when the launch priorities have been reviewed.</p></div><div className="flex flex-wrap gap-3"><Link href={`/dashboard/onboarding-v2/${sessionId}`} className="rounded-full bg-orange-300 px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] transition hover:bg-orange-200">Continue to Shop Activation</Link><Link href="/dashboard/ai-recommendations" className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]">Review All AI Recommendations</Link></div></section>
        </>
      ) : (
        <section className="rounded-[2rem] border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-sm leading-6 text-[color:var(--theme-text-secondary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
          <h2 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">What the analysis will review</h2>
          <p className="mt-3 max-w-3xl">Run AI Business Analysis to create a deterministic executive summary from the evidence already collected during guided setup. No launch score, observations, or priorities are shown until recommendations exist.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">Customers, vehicles, history, and invoices</div><div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">Parts, vendor coverage, and stock cleanup signals</div><div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">Shop settings, inspection templates, and menu items</div></div>
        </section>
      )}
    </main>
  );
}
