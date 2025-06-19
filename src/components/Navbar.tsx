'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="w-full fixed top-0 z-50 backdrop-blur bg-black/30 border-b border-orange-500/10">
      <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center text-white">
        {/* Logo / Name */}
        <Link href="/" className="text-2xl font-blackops text-orange-500 tracking-wide drop-shadow">
          ProFixIQ
        </Link>

        {/* Right-side CTA */}
        <Link
          href="/subscribe"
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow transition-all"
        >
          Plans
        </Link>
      </nav>
    </header>
  );
}