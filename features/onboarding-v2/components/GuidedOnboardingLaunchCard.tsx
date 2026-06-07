import Link from "next/link";

export function GuidedOnboardingLaunchCard({ source = "dashboard" }: { source?: "dashboard" | "settings" | "onboarding" }) {
  const copy =
    source === "settings"
      ? "Need to finish setup later? Open the optional guided checklist without changing your current settings."
      : "Bring a shop online at your pace with a guided checklist that links to the stable production pages.";

  return (
    <section
      data-testid="guided-onboarding-launch-card"
      className="rounded-[22px] border border-[var(--brand-accent,#E39A6E)]/25 bg-[radial-gradient(circle_at_top_left,rgba(227,154,110,0.18),rgba(8,13,25,0.88)_42%,rgba(2,6,23,0.94))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent,#E39A6E)]/90">
            Optional setup guide
          </div>
          <h2 className="mt-1 text-lg font-semibold text-white">Guided onboarding checklist</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-300">{copy}</p>
        </div>
        <Link
          href="/dashboard/onboarding-v2?mode=guided"
          className="inline-flex items-center justify-center rounded-xl border border-[var(--brand-accent,#E39A6E)]/45 bg-[var(--brand-accent,#E39A6E)]/18 px-4 py-2 text-sm font-semibold text-orange-50 transition hover:border-[var(--brand-accent,#E39A6E)] hover:bg-[var(--brand-accent,#E39A6E)]/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
        >
          Open guide
        </Link>
      </div>
    </section>
  );
}
