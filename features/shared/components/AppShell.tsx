"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const NavItem = ({ href, label }: { href: string; label: string }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={[
          "flex-1 text-center py-2 text-xs font-header tracking-wide",
          active ? "text-orange-400" : "text-neutral-300 hover:text-white",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Desktop header (hidden on mobile) */}
      <header className="hidden md:block fixed top-0 inset-x-0 z-30 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-header text-xl text-orange-400">ProFixIQ</Link>
          <nav className="flex gap-4 text-sm text-gray-300">
            <Link href="/" className="hover:text-orange-400">Home</Link>
            <Link href="/subscribe" className="hover:text-orange-400">Plans</Link>
            <Link href="/dashboard" className="hover:text-orange-400">Dashboard</Link>
            <a href="mailto:support@profixiq.com" className="hover:text-orange-400">Support</a>
          </nav>
        </div>
      </header>

      {/* Mobile header (hidden on md+) */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-header text-lg text-orange-400">ProFixIQ</Link>
          <div className="text-xs text-neutral-400">menu</div>
        </div>
      </header>

      {/* Content area with top padding for fixed header */}
      <div className="pt-14 md:pt-16">
        <main className="mx-auto max-w-7xl px-3 md:px-6">{children}</main>
      </div>

      {/* Mobile bottom nav (hidden on md+) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-black/90 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        <div className="flex px-2">
          <NavItem href="/dashboard" label="Dashboard" />
          <NavItem href="/work-orders" label="Work Orders" />
          <NavItem href="/inspections" label="Inspections" />
          <NavItem href="/tech-assistant" label="Assistant" />
        </div>
      </nav>

      {/* Bottom spacer on mobile so content isn’t hidden behind the nav */}
      <div className="h-12 md:h-0" />
    </div>
  );
}