// app/portal/layout.tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Any routes here will NOT get the customer portal header/nav
  const hidePortalNav =
    pathname?.startsWith("/portal/appointments") ?? false;
  // add more as needed:
  //   || pathname?.startsWith("/portal/scheduling")
  //   || pathname?.startsWith("/portal/whatever")

  // For hidden routes we still keep the dark background but no portal header
  if (hidePortalNav) {
    return (
      <div className="min-h-screen bg-black text-white">
        {children}
      </div>
    );
  }

  // Normal customer portal layout
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/portal" className="font-blackops text-orange-400">
            ProFixIQ Portal
          </Link>
          <nav className="flex gap-4 text-sm text-white/80">
            <Link href="/portal/booking" className="hover:text-orange-400">
              Book
            </Link>
            <Link href="/portal/history" className="hover:text-orange-400">
              History
            </Link>
            <Link href="/portal/vehicles" className="hover:text-orange-400">
              Vehicles
            </Link>
            <Link href="/portal/profile" className="hover:text-orange-400">
              Profile
            </Link>
            <Link href="/portal/settings" className="hover:text-orange-400">
              Settings
            </Link>
            <Link href="/portal/shop" className="hover:text-orange-400">
              Shop
            </Link>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}