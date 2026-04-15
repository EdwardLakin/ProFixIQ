import Link from "next/link";
import { loadShadowPreviewContext } from "@/features/integrations/shopBoost/shadowShop";
import {
  buildConsequenceItems,
  buildDecisionSummary,
  buildObjectionHandlingContent,
  buildStakeholderTakeaways,
  formatUsd,
} from "@/features/integrations/shopBoost/conversionPolish";

type PageProps = {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ intakeId?: string; sender?: string }>;
};

export default async function DemoReportPage({ params, searchParams }: PageProps) {
  const { demoId } = await params;
  const sp = await searchParams;
  const intakeId = typeof sp.intakeId === "string" ? sp.intakeId : "";
  const sender = typeof sp.sender === "string" ? sp.sender : null;

  const context = intakeId ? await loadShadowPreviewContext({ demoId, intakeId }) : null;
  if (!context) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-4 text-white">
        <div className="max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-lg font-semibold">Report unavailable</p>
          <p className="mt-2 text-sm text-neutral-400">This report link is missing context or has expired.</p>
        </div>
      </div>
    );
  }

  const { snapshot } = context;
  const decisionSummary = buildDecisionSummary(context);
  const consequences = buildConsequenceItems(snapshot).slice(0, 4);
  const objectionHandling = buildObjectionHandlingContent(snapshot);
  const stakeholderTakeaways = buildStakeholderTakeaways(snapshot);

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Instant Shop Analysis • Operational findings report</p>
          <h1 className="mt-1 text-2xl font-semibold">Decision brief for {context.shopName}</h1>
          <p className="mt-2 text-sm text-neutral-300">{sender ? `Shared by ${sender}. ` : ""}Preview-based findings from uploaded data only. Conservative and explainable estimates.</p>
        </div>

        <section className="rounded-xl border border-[rgba(214,176,150,0.35)] bg-[rgba(145,90,60,0.14)] p-4 text-sm">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[rgba(240,205,178,0.95)]">{decisionSummary.heading}</p>
          <p className="mt-2 text-white">{decisionSummary.summary}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-neutral-200">Value at risk now: <span className="font-semibold text-white">{formatUsd(decisionSummary.monthlyValueAtRisk)}/month</span></p>
            <p className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-neutral-200">Estimated recoverable value: <span className="font-semibold text-emerald-300">{formatUsd(decisionSummary.recoverableValue)}/month</span></p>
          </div>
          <div className="mt-3 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-neutral-300">
            <p>{decisionSummary.readinessSummary}</p>
            <p className="mt-1 text-neutral-400">{decisionSummary.blockerSummary}</p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-300">
            <p className="font-semibold text-white">Top operational drivers</p>
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
              <li key={item.key} className="rounded-md border border-white/15 bg-black/20 px-3 py-2">
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-amber-50/90">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-300">
          <p className="font-semibold text-white">Stakeholder messaging</p>
          <div className="mt-2 space-y-2">
            {stakeholderTakeaways.map((takeaway) => (
              <div key={takeaway.role} className="rounded-md border border-white/10 bg-black/30 px-3 py-2">
                <p className="font-semibold text-white">{takeaway.label}</p>
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

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-300">
          <p className="font-semibold text-white">Recommended next step</p>
          <p className="mt-1">{decisionSummary.primaryActionHelper}</p>
          <div className="mt-3">
            <Link href={`/demo/preview/${context.demoId}?intakeId=${context.intakeId}&mode=sales`} className="inline-flex rounded-md bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-black">
              {decisionSummary.primaryActionLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
