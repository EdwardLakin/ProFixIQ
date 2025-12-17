// app/portal/page.tsx
"use client";

import Link from "next/link";

const COPPER = "#C57A4A";

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {title}
      </div>
      <div className="mt-2 text-2xl font-blackops" style={{ color: COPPER }}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

export default function PortalHomePage() {
  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
          Home
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Quick overview — just like the mobile dashboard.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Upcoming" value="—" sub="Next appointment" />
        <StatCard title="Vehicles" value="—" sub="Saved to your account" />
        <StatCard title="Last visit" value="—" sub="Most recent service" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/portal/booking"
          className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm font-semibold text-neutral-100 backdrop-blur-md shadow-card transition hover:bg-black/35"
        >
          <div className="flex items-center justify-between">
            <span>Book an appointment</span>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COPPER }}
            />
          </div>
          <div className="mt-1 text-xs font-normal text-neutral-400">
            Pick a shop, choose time, confirm.
          </div>
        </Link>

        <Link
          href="/portal/vehicles"
          className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-semibold text-neutral-100 backdrop-blur-md shadow-card transition hover:bg-black/35"
        >
          <div className="flex items-center justify-between">
            <span>Manage vehicles</span>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COPPER }}
            />
          </div>
          <div className="mt-1 text-xs font-normal text-neutral-400">
            Add VIN, plate, mileage, color.
          </div>
        </Link>
      </div>

      {/* Recent activity block */}
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-50">
            Recent activity
          </h2>
          <Link
            href="/portal/customer-appointments"
            className="text-xs text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
            style={{ textDecorationColor: "rgba(197,122,74,0.65)" }}
          >
            View appointments
          </Link>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-neutral-400">
          No activity yet. Once you book, your timeline will show here.
        </div>
      </div>
    </div>
  );
}