"use client"

import Link from "next/link";

type TileProps = { href: string; title: string; subtitle?: string; cta?: string };

function Tile({ href, title, subtitle, cta }: TileProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-white/10 bg-neutral-900 p-4 transition hover:-translate-y-0.5 hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10"
      aria-label={title}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {cta ? <span className="rounded bg-orange-500 px-3 py-1 text-sm font-semibold text-black">{cta}</span> : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
    </Link>
  );
}

export default function AdvisorDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-white">
      <h1 className="mb-6 text-3xl font-bold text-orange-400">Advisor Dashboard</h1>

      {/* Work Orders */}
      <h2 className="mb-3 text-xl font-semibold">Work Orders</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tile href="/work-orders/create" title="Create Work Order" subtitle="Start a new job for a vehicle" cta="+" />
        <Tile href="/work-orders/customer" title="Customer Work Order Request" subtitle="Capture a customer request" />
        <Tile href="/work-orders/queue" title="Job Queue" subtitle="Active, paused, and in-progress jobs" />
        <Tile href="/work-orders/quote-review" title="Quote Review" subtitle="Review and send estimates" />
        <Tile href="/work-orders" title="View Work Orders" subtitle="Find & open specific work orders" />
        <Tile href="/work-orders" title="Open Work Order by ID" subtitle="Use list to select a specific ID" />
      </div>

      {/* Inspections */}
      <h2 className="mt-8 mb-3 text-xl font-semibold">Inspections</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tile href="/inspections/templates" title="Templates" subtitle="Browse inspection templates" />
        <Tile href="/inspections/custom-inspection" title="Custom Inspection" subtitle="Build a custom checklist" />
        <Tile href="/inspections/created" title="Recently Created" subtitle="Newly started inspections" />
        <Tile href="/inspections/saved" title="Saved" subtitle="Draft inspections in progress" />
        <Tile href="/inspections/summary" title="Summaries" subtitle="Review inspection summaries" />
        <Tile href="/inspections/customer-vehicle" title="Customer & Vehicle" subtitle="Start from basic info" />
        <Tile href="/inspections" title="Open Inspection by ID" subtitle="Use list to select a specific ID" />
      </div>

      {/* Booking */}
      <h2 className="mt-8 mb-3 text-xl font-semibold">Booking</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tile href="/dashboard/advisor/bookings" title="Bookings" subtitle="View & manage appointments" />
      </div>
    </div>
  );
}

