// app/portal/layout.tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/portal/booking", label: "Book" },
  { href: "/portal/history", label: "History" },
  { href: "/portal/vehicles", label: "Vehicles" },
  { href: "/portal/profile", label: "Profile" },
  { href: "/portal/settings", label: "Settings" },
  { href: "/portal/shop", label: "Shop" }, // assumes you have /portal/shop index or redirect
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/portal" className="font-blackops text-lg text-orange-400">
            ProFixIQ Portal
          </Link>
          <nav className="flex gap-4 text-xs sm:text-sm text-white/70">
            {NAV_LINKS.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/portal" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    "border-b-2 border-transparent pb-0.5 transition " +
                    (active
                      ? "border-orange-400 text-orange-300"
                      : "hover:text-orange-300")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}