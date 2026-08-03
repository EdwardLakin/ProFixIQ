import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";
import { verifyShopBoostPreviewToken } from "@/features/integrations/shopBoost/shareAccess";
import {
  buildConsequenceItems,
  buildDecisionSummary,
  buildObjectionHandlingContent,
  buildStakeholderTakeaways,
  formatUsd,
} from "@/features/integrations/shopBoost/conversionPolish";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function DemoReportPage({ params, searchParams }: PageProps) {
  noStore();

  const [{ demoId: routeDemoId }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.token === "string" ? sp.token : "";
  const access = token ? verifyShopBoostPreviewToken(token) : null;
  if (!access || access.demoId !== routeDemoId) notFound();

  const context = await loadShadowPreviewContext({
    demoId: access.demoId,
    intakeId: access.intakeId,
  });
  if (!context) notFound();

  const { snapshot } = context;
  const sender = access.senderName ?? null;
  const decisionSummary = buildDecisionSummary(context);
  const consequences = buildConsequenceItems(snapshot).slice(0, 4);
  const objectionHandling = buildObjectionHandlingContent(snapshot);
  const stakeholderTakeaways = buildStakeholderTakeaways(snapshot);

  return (
    <div className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 py-8 text-[color:var(--theme-text-primary)] sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Instant Shop Analysis • Operational findings report</p>
          <h1 className="mt-1 text-2xl font-semibold">Decision brief for {context.shopName}</h1>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">{sender ? `Shared by ${sender}. ` : ""}Preview-based findings from uploaded data only. Conservative and explainable estimates.</p>
        </div>

        <section className="rounded-xl border border-[rgba(214,176,150,0.35)] bg-[rgba(145,90,60,0.14)] p-4 text-sm">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[rgba(240,205,178,0.95)]">{decisionSummary.heading}</p>
          <p className="mt-2 text-[color:var(--theme-text-primary)]">{decisionSummary.summary}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[color:var(--theme-text-primary)]">Value at risk now: <span className="font-semibold text-[color:var(--theme-text-primary)]">{formatUsd(decisionSummary.monthlyValueAtRisk)}/month</span></p>
            <p className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[color:var(--theme-text-primary)]">Estimated recoverable value: <span className="font-semibold text-emerald-300">{formatUsd(decisionSummary.recoverableValue)}/month</span></p>
          </div>
          <div className="mt-3 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
            <p>{decisionSummary.readinessSummary}</p>
            <p className="mt-1 text-[color:var(--theme-text-secondary)]">{decisionSummary.blockerSummary}</p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            <p className="font-semibold text-[color:var(--theme-text-primary)]">Top operational drivers</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {decisionSummary.topDrivers.map((driver) => (
                <li key={driver}>{driver}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            <p className="font-semibold">{decisionSummary.confidence.title} ({snapshot.projectionConfidence.score}%)</p>
            <p className="mt-1">{decisionSummary.confidence.explanation}</p>
            <p className="mt-2 text-cyan-50/90">What increases confidence: {decisionSummary.confidence.increasesConfidence}</p>
            <p className="mt-1 text-cyan-50/70">What lowers confidence: {decisionSummary.confidence.lowersConfidence}</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Business consequences if unresolved</p>
          <ul className="mt-2 space-y-2">
            {consequences.map((item) => (
              <li key={item.key} className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                <p className="font-semibold text-[color:var(--theme-text-primary)]">{item.title}</p>
                <p className="mt-1 text-amber-50/90">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          <p className="font-semibold text-[color:var(--theme-text-primary)]">Stakeholder messaging</p>
          <div className="mt-2 space-y-2">
            {stakeholderTakeaways.map((takeaway) => (
              <div key={takeaway.role} className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                <p className="font-semibold text-[color:var(--theme-text-primary)]">{takeaway.label}</p>
                <p className="mt-1">{takeaway.message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          <p className="font-semibold">{objectionHandling.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {objectionHandling.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <p className="mt-2 text-cyan-50/90">{objectionHandling.whyReviewExists}</p>
        </div>

        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          <p className="font-semibold text-[color:var(--theme-text-primary)]">Recommended next step</p>
          <p className="mt-1">{decisionSummary.primaryActionHelper}</p>
          <div className="mt-3">
            <Link href={`/demo/preview/${context.demoId}?${new URLSearchParams({ token, mode: "sales" }).toString()}`} className="inline-flex rounded-md bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)]">
              {decisionSummary.primaryActionLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
