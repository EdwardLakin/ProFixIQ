"use client";

import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="relative bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-24 md:py-32 text-center">
        <p className="text-xs sm:text-sm tracking-wide text-neutral-300 uppercase">
          Repair Smarter. Diagnose Faster.
        </p>

        {/* Big, always-visible title. No custom utility needed. */}
        <h1
          data-testid="landing-title"
          style={{ fontFamily: "var(--font-blackops)" }} // uses the var you expose in app/layout.tsx
          className="mt-4 text-[56px] leading-[1.05] sm:text-[84px]
                     text-orange-400
                     md:text-transparent md:bg-clip-text md:bg-gradient-to-r md:from-[#ff6a00] md:to-[#ffd700]
                     drop-shadow-[0_0_28px_rgba(255,106,0,0.35)]"
        >
          ProFixIQ
        </h1>

        <p className="mx-auto mt-4 max-w-3xl text-base sm:text-lg text-neutral-300">
          From diagnostics to dispatch — AI handles the heavy lifting. Streamline every
          repair, inspection, and work order with smart automation.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/sign-in?redirectedFrom=/ai"
            className="rounded-lg bg-orange-500 px-5 py-3 font-bold text-black shadow hover:bg-orange-600"
          >
            Try the AI
          </Link>

          <a
            href="#features"
            className="rounded-lg border border-neutral-600 px-5 py-3 font-bold text-white hover:bg-white hover:text-black"
          >
            Explore Features
          </a>

          <a
            href="#why"
            className="rounded-lg border border-neutral-600 px-5 py-3 font-bold text-white hover:bg-white hover:text-black"
          >
            Why ProFixIQ?
          </a>
        </div>
      </div>
    </section>
  );
}