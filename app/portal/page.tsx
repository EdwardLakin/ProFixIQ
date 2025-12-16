// app/portal/page.tsx
"use client";

import Link from "next/link";

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
    <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/50 p-4 backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {title}
      </div>
      <div className="mt-2 text-2xl font-blackops text-orange-500">{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

export default function PortalHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-blackops text-orange-500">Home</h1>
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
          className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/15"
        >
          📅 Book an appointment
          <div className="mt-1 text-xs font-normal text-neutral-400">
            Pick a shop, choose time, confirm.
          </div>
        </Link>

        <Link
          href="/portal/vehicles"
          className="rounded-2xl border border-neutral-800/70 bg-neutral-950/50 p-4 text-sm font-semibold text-neutral-100 backdrop-blur transition hover:bg-neutral-900/50"
        >
          🚗 Manage vehicles
          <div className="mt-1 text-xs font-normal text-neutral-400">
            Add VIN, plate, mileage, color.
          </div>
        </Link>
      </div>

      {/* Recent activity block */}
      <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/50 p-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-50">Recent activity</h2>
          <Link href="/portal/appointments" className="text-xs text-orange-300 underline underline-offset-2">
            View appointments
          </Link>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-neutral-800/70 bg-neutral-950/30 p-3 text-sm text-neutral-400">
          No activity yet. Once you book, your timeline will show here.
        </div>
      </div>
    </div>
  );
}