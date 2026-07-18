import Link from "next/link";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

export const dynamic = "force-dynamic";

export default async function MobilePartsPage() {
  const payload = await getOperationsDashboardPayload();

  const lanes = [
    { title: "Requests", detail: "Review new and unquoted requests.", href: "/mobile/work-orders?parts=requested" },
    { title: "Awaiting approval", detail: "See work waiting on customer authorization.", href: "/mobile/work-orders?parts=approval" },
    { title: "On order", detail: "Track jobs blocked by ordered parts.", href: "/mobile/work-orders?parts=ordered" },
    { title: "Ready for technician", detail: "Return received parts to active work.", href: "/mobile/work-orders?parts=ready" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 overflow-x-hidden px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">Parts</div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">Parts workflow</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Keep requests, orders, receiving, and technician release inside the mobile shell.</p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="text-xs text-[color:var(--theme-text-secondary)]">Waiting parts</div>
          <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{payload.topSummary.waitingParts}</div>
        </div>
        <Link href="/mobile/work-orders" className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
          <div className="text-xs text-[color:var(--theme-text-secondary)]">Repair context</div>
          <div className="mt-1 text-sm font-semibold text-[color:var(--accent-copper)]">Open work orders →</div>
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {lanes.map((lane) => (
          <Link key={lane.title} href={lane.href} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
            <div className="font-semibold text-[color:var(--theme-text-primary)]">{lane.title}</div>
            <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{lane.detail}</div>
          </Link>
        ))}
      </section>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
        <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Mobile parts rollout</h2>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">This workspace now keeps navigation mobile-native. Detailed quote, order, and receiving actions will be migrated here incrementally instead of opening desktop boards.</p>
      </section>
    </div>
  );
}
