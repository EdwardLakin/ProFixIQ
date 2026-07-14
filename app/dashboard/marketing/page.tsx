import Link from "next/link";

import PageShell from "@/features/shared/components/PageShell";

export default function DashboardMarketingPage() {
  return (
    <PageShell title="Marketing">
      <section className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-[color:var(--theme-text-primary)]">
        <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-200">
          Coming soon
        </div>

        <h1 className="mt-4 text-2xl font-semibold">ShopReel Marketing Hub is almost ready</h1>
        <p className="mt-3 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
          We are actively finalizing the ShopReel experience inside ProFixIQ. Access is temporarily restricted while we complete
          launch hardening, partner validation, and workflow QA.
        </p>

        <div className="mt-5 grid gap-3 text-sm text-[color:var(--theme-text-secondary)] md:grid-cols-2">
          <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
            <h2 className="font-medium text-[color:var(--theme-text-primary)]">What is ShopReel?</h2>
            <p className="mt-2 text-[color:var(--theme-text-secondary)]">
              ShopReel helps shops turn service milestones into branded, publish-ready story content for social and customer engagement.
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
            <h2 className="font-medium text-[color:var(--theme-text-primary)]">What to expect at launch</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[color:var(--theme-text-secondary)]">
              <li>Operational signal to story opportunity pipeline</li>
              <li>Draft queue and approval workflow for advisors and owners</li>
              <li>Publishing controls and delivery health visibility</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-md border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Back to dashboard
          </Link>
          <Link
            href="/dashboard/owner/marketing"
            className="rounded-md bg-[color:var(--theme-surface-panel-strong)] px-4 py-2 text-sm font-medium text-[color:var(--theme-text-on-accent)]"
          >
            Owner settings
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
