// app/work-orders/page.tsx
"use client";

import Link from "next/link";

export const revalidate = 0;

type TileProps = {
  href: string;
  title: string;
  subtitle?: string;
  cta?: string;
};

function Tile(props: TileProps) {
  return (
    <Link
      href={props.href}
      className="block rounded-lg border border-white/10 bg-neutral-900 p-4 transition
                 hover:-translate-y-0.5 hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10"
      aria-label={props.title}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{props.title}</h2>
        {props.cta ? (
          <span className="rounded bg-orange-500 px-3 py-1 text-sm font-semibold text-black">
            {props.cta}
          </span>
        ) : null}
      </div>
      {props.subtitle ? (
        <p className="mt-1 text-sm text-white/70">{props.subtitle}</p>
      ) : null}
    </Link>
  );
}

export default function WorkOrdersHome() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="mb-6 text-3xl font-bold text-orange-400">Work Orders</h1>

      <div className="grid grid-cols-1 gap-4">
        <Tile
          href="/work-orders/create"
          title="Create Work Order"
          subtitle="Start a new job for a vehicle"
          cta="+"
        />
        <Tile
          href="/work-orders/queue"
          title="Job Queue"
          subtitle="See active, paused, and in-progress jobs"
        />
        <Tile
          href="/work-orders/editor"
          title="Work Order Editor"
          subtitle="Compose job lines from menu items or free-type"
        />
        <Tile
          href="/work-orders/quote-review"
          title="Quote Review"
          subtitle="Review and send estimates"
        />
        <Tile
          href="/work-orders/view"
          title="View Work Orders"
          subtitle="Browse and manage all work orders"
        />
        <Tile
          href="/customers"
          title="Customer Profiles"
          subtitle="Browse customers, history, and vehicles"
        />
      </div>
    </div>
  );
}