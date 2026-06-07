import Link from "next/link";

import { GUIDED_ONBOARDING_STEPS } from "@/features/onboarding-v2/guided/steps";

const CATEGORY_LABELS = {
  setup: "Shop setup",
  data: "Data setup",
  operations: "Operations setup",
} as const;

export function GuidedOnboardingWorkspace() {
  return (
    <section
      data-testid="guided-onboarding-workspace"
      className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.3)]"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">
            Guided onboarding · optional
          </div>
          <h2 className="mt-1 text-xl font-semibold text-white">Stable setup checklist</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            This guide launches only when you choose it. Each step links to an existing production page and does not change auth routing, middleware, shop assignment, or work-order flows.
          </p>
        </div>
        <Link href="/dashboard/operations" className="text-sm font-semibold text-slate-300 underline-offset-4 hover:text-white hover:underline">
          Return to dashboard
        </Link>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {GUIDED_ONBOARDING_STEPS.map((step, index) => (
          <article key={step.stepKey} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {String(index + 1).padStart(2, "0")} · {CATEGORY_LABELS[step.category]}
                </div>
                <h3 className="mt-1 text-sm font-semibold text-white">{step.title}</h3>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                Optional UI
              </span>
            </div>
            <p className="mt-2 min-h-12 text-xs leading-5 text-slate-400">{step.description}</p>
            <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400">
              State source: {step.dataSource.label}
            </div>
            {step.importLaunch?.stable ? (
              <Link
                href={step.importLaunch.href}
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-orange-300/40 hover:bg-orange-400/10"
              >
                {step.importLaunch.label}
              </Link>
            ) : null}
            <Link
              href={step.destinationPath}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-orange-300/40 hover:bg-orange-400/10"
            >
              {step.cta}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
