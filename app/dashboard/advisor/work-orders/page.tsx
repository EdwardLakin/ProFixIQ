"use client";
import Link from "next/link";

export default function WorkOrdersHome() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="mb-6 text-3xl font-bold text-orange-400">Work Orders</h1>

      <div className="grid grid-cols-1 gap-4">
        <Tile
          href="/dashboard/work-orders/create"
          title="Create Work Order"
          subtitle="Start a new job for a vehicle"
          cta="+"
        />
        <Tile
          href="/dashboard/work-orders/customer"
          title="Customer Work Order Request"
          subtitle="Capture a customer-initiated request"
        />
        <Tile
          href="/dashboard/work-orders/queue"
          title="Job Queue"
          subtitle="See active, paused, and in-progress jobs"
        />
        <Tile
          href="/dashboard/work-orders/quote-review"
          title="Quote Review"
          subtitle="Review and send estimates"
        />
        <Tile
          href="/dashboard/work-orders/view"
          title="View Work Orders"
          subtitle="Browse and manage all work orders"
        />
      </div>
    </div>
  );
}

function Tile({
  href,
  title,
  subtitle,
  cta,
}: {
  href: string;
  title: string;
  subtitle?: string;
  cta?: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-white/10 bg-neutral-900 p-4 transition
                 hover:-translate-y-0.5 hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10"
      aria-label={title}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {cta ? (
          <span className="rounded bg-orange-500 px-3 py-1 text-sm font-semibold text-black">
            {cta}
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
    </Link>
  );
}