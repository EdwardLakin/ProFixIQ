'use client';

import Link from 'next/link';

export default function SubscribeBanner() {
  return (
    <div className="mt-8 mb-12 text-center">
      <div className="inline-block px-6 py-4 bg-white/5 backdrop-blur-md border border-orange-500/20 rounded-xl shadow-md">
        <p className="text-lg text-orange-200 font-semibold">
          Unlock full access to AI diagnostics and tools.
        </p>
        <Link
          href="/compare-plans"
          className="inline-block mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold shadow transition-all"
        >
          View Plans
        </Link>
      </div>
    </div>
  );
}