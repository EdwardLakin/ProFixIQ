import { Boxes, ChevronRight, PackageCheck, PackageOpen, Truck } from "lucide-react";
import Link from "next/link";

import MobilePartsWorkflow from "@/features/parts/mobile/MobilePartsWorkflow";

export const dynamic = "force-dynamic";

export default function MobilePartsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Boxes aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Parts desk</div>
            <h1 className="mobile-dashboard-hero__title">Parts workflow</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Quote, order, receive, allocate and hand off parts without losing the repair context.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/mobile/parts?view=requests"
          className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
            <PackageOpen aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              Requests
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Review new needs
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--accent-copper)]" />
        </Link>
        <Link
          href="/mobile/parts?view=ready"
          className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <PackageCheck aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              Ready
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Release to tech
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--accent-copper)]" />
        </Link>
        <Link
          href="/mobile/parts/truck"
          className="mobile-command-row col-span-2 flex min-h-[5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <Truck aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              Truck inventory
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Assigned Field Service vehicle stock
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--accent-copper)]" />
        </Link>
      </section>

      <MobilePartsWorkflow />
    </main>
  );
}
