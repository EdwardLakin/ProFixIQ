"use client";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative isolate px-safe pb-10 pt-16 sm:pt-20">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,140,0,0.10),rgba(0,0,0,0))]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-[11px] uppercase tracking-[0.2em] text-white/60">Repair smarter. Diagnose faster.</p>
          <h1 className="font-black leading-tight"
              style={{ fontFamily: "var(--font-blackops)" }}>
            <span className="text-[clamp(40px,8vw,84px)] text-orange-400">ProFixIQ</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
            From diagnostics to dispatch—AI handles the heavy lifting.
            Streamline every inspection and work order with smart automation.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/(app)/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-3 font-semibold text-black hover:bg-orange-400 active:bg-orange-600">
              Try the App
            </Link>
            <Link href="#features"
              className="inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10">
              Explore Features
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
