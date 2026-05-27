import Link from "next/link";

import PageShell from "@/features/shared/components/PageShell";

export default function DashboardMarketingPage() {
  return (
    <PageShell title="Marketing">
      <section className="rounded-xl border border-white/10 bg-black/20 p-6 text-white">
        <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-200">
          Coming soon
        </div>

        <h1 className="mt-4 text-2xl font-semibold">ShopReel Marketing Hub is almost ready</h1>
        <p className="mt-3 max-w-3xl text-sm text-white/75">
          We are actively finalizing the ShopReel experience inside ProFixIQ. Access is temporarily restricted while we complete
          launch hardening, partner validation, and workflow QA.
        </p>

        <div className="mt-5 grid gap-3 text-sm text-white/80 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="font-medium text-white">What is ShopReel?</h2>
            <p className="mt-2 text-white/70">
              ShopReel helps shops turn service milestones into branded, publish-ready story content for social and customer engagement.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="font-medium text-white">What to expect at launch</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
              <li>Operational signal to story opportunity pipeline</li>
              <li>Draft queue and approval workflow for advisors and owners</li>
              <li>Publishing controls and delivery health visibility</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5"
          >
            Back to dashboard
          </Link>
          <Link
            href="/dashboard/owner/marketing"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Owner settings
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
