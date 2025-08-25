"use client";

import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="relative bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 pt-24 pb-24 text-center">
        <p className="text-xs tracking-[0.22em] text-neutral-400 uppercase">
          Repair Smarter. Diagnose Faster.
        </p>

        {/* Black Ops title via font-header */}
        <h1
          className="
            font-header
            mt-4
            text-[44px] leading-tight
            sm:text-[72px]
            md:text-[96px]
            lg:text-[112px]
            drop-shadow-[0_0_30px_rgba(255,106,0,0.25)]
            bg-gradient-to-b from-orange-400 to-orange-600 text-transparent bg-clip-text
          "
        >
          ProFixIQ
        </h1>

        <p className="mx-auto mt-5 max-w-3xl text-base sm:text-lg text-neutral-300">
          From diagnostics to dispatch — AI handles the heavy lifting. Streamline every
          repair, inspection, and work order with smart automation.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sign-in?redirectedFrom=/ai"
            className="rounded-lg bg-orange-500 px-5 py-3 font-semibold text-black shadow hover:bg-orange-600"
          >
            Try the AI
          </Link>

          <a
            href="#features"
            className="rounded-lg border border-orange-500/60 px-5 py-3 font-semibold text-white hover:bg-orange-500 hover:text-black"
          >
            Explore Features
          </a>

          <a
            href="#why"
            className="rounded-lg border border-orange-500/60 px-5 py-3 font-semibold text-white hover:bg-orange-500 hover:text-black"
          >
            Why ProFixIQ?
          </a>
        </div>
      </div>
    </section>
  );
}