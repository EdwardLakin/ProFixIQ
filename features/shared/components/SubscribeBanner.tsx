"use client";

import Link from "next/link";

export default function SubscribeBanner() {
  return (
    <div className="mt-12 mb-20 text-center">
      <div className="inline-block px-8 py-6 bg-white/5 backdrop-blur-lg border border-orange-500/30 rounded-2xl shadow-xl transition-all hover:shadow-glow">
        <p className="text-xl text-orange-200 font-blackopsone tracking-wide">
          Unlock full access to AI diagnostics and tools.
        </p>
        <Link
          href="/compare-plans"
          className="inline-block mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-md transition-all"
        >
          View Plans
        </Link>
      </div>
    </div>
  );
}
