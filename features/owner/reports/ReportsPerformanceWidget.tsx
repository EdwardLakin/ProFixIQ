//features/owner/reports/ReportsPerformanceWidget.tsx

"use client";

import Link from "next/link";

export default function ReportsPerformanceWidget() {
  return (
    <section className="rounded-2xl border border-orange-500/40 bg-gradient-to-r from-slate-950/80 via-slate-900/70 to-slate-950/80 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
            Dashboard · Reports
          </div>

          <h2
            className="mt-1 text-xl text-orange-400"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Financial & Technician Performance
          </h2>

          <p className="text-xs text-neutral-400">
            Revenue, profit, expenses and technician efficiency.
          </p>
        </div>

        <Link
          href="/dashboard/owner/reports"
          className="rounded-full border border-orange-500/60 bg-orange-500/10 px-3 py-1 text-xs text-orange-100 hover:bg-orange-500 hover:text-black"
        >
          Open reports →
        </Link>
      </div>
    </section>
  );
}