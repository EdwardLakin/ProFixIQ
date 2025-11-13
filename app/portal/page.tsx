// app/portal/page.tsx
"use client";

import Link from "next/link";

export default function PortalHome() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-blackops text-orange-400">
          Welcome to your portal
        </h1>
        <p className="text-sm text-neutral-400">
          Track your vehicles, review service history, and book your next visit
          — all in one place.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/portal/booking"
          className="group rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-orange-500 hover:bg-neutral-900"
        >
          <div className="mb-1 text-sm font-semibold text-white">
            Book an appointment
          </div>
          <p className="text-xs text-neutral-400">
            Pick a time that works for you, directly with your shop.
          </p>
          <div className="mt-3 text-xs font-medium text-orange-400 group-hover:text-orange-300">
            Schedule now →
          </div>
        </Link>

        <Link
          href="/portal/history"
          className="group rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-orange-500 hover:bg-neutral-900"
        >
          <div className="mb-1 text-sm font-semibold text-white">
            Service history
          </div>
          <p className="text-xs text-neutral-400">
            Review past visits, notes, and work completed on your vehicles.
          </p>
          <div className="mt-3 text-xs font-medium text-orange-400 group-hover:text-orange-300">
            View history →
          </div>
        </Link>

        <Link
          href="/portal/vehicles"
          className="group rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-orange-500 hover:bg-neutral-900"
        >
          <div className="mb-1 text-sm font-semibold text-white">
            Manage vehicles
          </div>
          <p className="text-xs text-neutral-400">
            Keep your vehicle details up to date so estimates stay accurate.
          </p>
          <div className="mt-3 text-xs font-medium text-orange-400 group-hover:text-orange-300">
            Manage vehicles →
          </div>
        </Link>
      </div>
    </div>
  );
}