"use client";

import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="relative bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-16 text-center">
        <p className="text-sm tracking-wide text-neutral-300 uppercase">
          Repair Smarter. Diagnose Faster.
        </p>

        {/* Title: visible color by default; gradient only on md+ */}
        <h1
          className="
            mt-3
            text-[56px] leading-[1.05]
            sm:text-[84px]
            text-orange-400
            md:text-transparent md:bg-clip-text md:bg-gradient-to-r md:from-[#ff6a00] md:to-[#ffd700]
            drop-shadow-[0_0_28px_rgba(255,106,0,0.35)]
          "
          // ensure the Black Ops font is actually applied even if Tailwind utility isn't present
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          ProFixIQ
        </h1>

        <p className="mx-auto mt-3 max-w-3xl text-base sm:text-lg text-neutral-300">
          From diagnostics to dispatch — AI handles the heavy lifting. Streamline
          every repair, inspection, and work order with smart automation.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
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