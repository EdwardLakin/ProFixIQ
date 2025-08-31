// app/portal/layout.tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl h-14 px-4 flex items-center justify-between">
          <Link href="/portal" className="font-blackops text-orange-400">
            ProFixIQ Portal
          </Link>
          <nav className="flex gap-4 text-sm text-white/80">
            <Link href="/portal/booking" className="hover:text-orange-400">Book</Link>
            <Link href="/portal/history" className="hover:text-orange-400">History</Link>
            <Link href="/portal/profile" className="hover:text-orange-400">Profile</Link>
            <Link href="/portal/settings" className="hover:text-orange-400">Settings</Link>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}