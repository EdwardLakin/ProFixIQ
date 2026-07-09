import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export default async function GuidedOnboardingAnalysisSummaryPage({ params }: Props) {
  const { sessionId } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-10 pt-6 text-neutral-100 sm:px-6 lg:px-8">
      <GuidedPageStepPanel />
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Guided Setup · AI Business Analysis</p>
        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Review recommended launch improvements</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-300">
          ProFixIQ AI Business Analysis reviews the customers, vehicles, history, invoices, parts, and shop defaults that were imported or configured during guided setup. It recommends next actions for the shop; it does not auto-create operational records.
        </p>
        <p className="mt-2 text-xs text-neutral-500">Session: {sessionId}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          ["1", "Inspection templates first", "Recommend inspection templates that match the shop's vehicle mix, common jobs, and inspection goals before building canned services."],
          ["2", "Menu items and canned services second", "Recommend menu items after inspection guidance, because canned services can attach inspections."],
          ["3", "Inventory improvements", "Flag fast-moving parts, missing stock coverage, reorder opportunities, and cleanup candidates."],
          ["4", "Vendor suggestions", "Identify vendor gaps or consolidation opportunities from configured parts and invoice patterns."],
          ["5", "Customer and fleet segments", "Suggest segments for retention, fleet handling, declined work follow-up, and targeted communication."],
          ["6", "Maintenance packages", "Recommend packages that align with shop history, vehicle types, and recurring mileage or time intervals."],
          ["7", "Automation rules", "Suggest reminders, review prompts, approval follow-ups, and internal workflow automations for owner review."],
        ].map(([index, title, description]) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-black/35 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.30)] backdrop-blur-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-orange-300/30 bg-orange-300/10 text-sm font-semibold text-orange-100">{index}</span>
            <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
