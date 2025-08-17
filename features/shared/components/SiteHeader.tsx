// features/shared/components/SiteHeader.tsx
"use client";
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-orange-400 font-semibold tracking-wide">
          ProFixIQ
        </Link>
        <nav className="hidden sm:flex gap-4 text-sm text-gray-300">
          <Link href="/">Home</Link>
          <Link href="/subscribe">Plans</Link>
          <Link href="/dashboard">Dashboard</Link>
          <a href="mailto:support@profixiq.com">Support</a>
        </nav>
      </div>
    </header>
  );
}