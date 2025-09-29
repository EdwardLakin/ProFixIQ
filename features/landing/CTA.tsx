"use client";
import Link from "next/link";
export default function CTA() {
  return (
    <section className="px-safe py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-br from-orange-500/15 to-orange-400/5 p-6 ring-1 ring-orange-500/20 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-semibold sm:text-xl">Ready to repair smarter?</h3>
              <p className="mt-1 text-sm text-white/80">Sign in and try ProFixIQ with your shop’s data.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link href="/(app)/dashboard"
                className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-3 font-semibold text-black hover:bg-orange-400">
                Open Dashboard
              </Link>
              <Link href="/compare-plans"
                className="inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10">
                Plans & Billing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
