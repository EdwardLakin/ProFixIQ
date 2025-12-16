// features/portal/components/PortalShell.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string; // emoji for now; swap to your icon set later
};

const NAV: NavItem[] = [
  { href: "/portal", label: "Home", icon: "🏠" },
  { href: "/portal/booking", label: "Book", icon: "📅" },
  { href: "/portal/appointments", label: "Appointments", icon: "🗓️" },
  { href: "/portal/history", label: "History", icon: "🧾" },
  { href: "/portal/vehicles", label: "Vehicles", icon: "🚗" },
  { href: "/portal/profile", label: "Profile", icon: "👤" },
  { href: "/portal/settings", label: "Settings", icon: "⚙️" },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const COPPER = "#C57A4A";

export default function PortalShell({
  title = "Customer Portal",
  subtitle = "Manage bookings, vehicles, and your profile",
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(false);

  const activeHref = useMemo(() => {
    const exact = NAV.find((x) => x.href === pathname);
    if (exact) return exact.href;

    const starts = NAV.find(
      (x) => x.href !== "/portal" && pathname.startsWith(x.href),
    );
    return starts?.href ?? "/portal";
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      {/* Background glow (burnt copper / metallic vibe) */}
      <div className="pointer-events-none fixed inset-0 opacity-45">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 12%, rgba(197,122,74,0.22), transparent 55%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 78% 18%, rgba(153,70,24,0.16), transparent 56%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 86%, rgba(255,255,255,0.06), transparent 58%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 flex-col border-r border-white/10 bg-black/20 backdrop-blur-md md:flex">
          <div className="px-5 py-5">
            <div className="text-lg font-blackops" style={{ color: COPPER }}>
              ProFixIQ
            </div>
            <div className="mt-1 text-xs text-neutral-400">Customer Portal</div>
          </div>

          <nav className="flex-1 space-y-1 px-3 pb-4">
            {NAV.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition",
                    active
                      ? "border-white/10 bg-white/5"
                      : "border-transparent text-neutral-200 hover:border-white/10 hover:bg-white/5",
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span
                    className={cx(
                      "font-semibold",
                      active ? "text-neutral-50" : "text-neutral-200",
                    )}
                  >
                    {item.label}
                  </span>
                  {active ? (
                    <span
                      className="ml-auto h-2 w-2 rounded-full"
                      style={{ backgroundColor: COPPER }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="px-5 pb-5 text-xs text-neutral-500">
            Powered by ProFixIQ
          </div>
        </aside>

        {/* Mobile overlay sidebar */}
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-80 border-r border-white/10 bg-black/55 backdrop-blur-md">
              <div className="flex items-center justify-between px-5 py-5">
                <div>
                  <div className="text-lg font-blackops" style={{ color: COPPER }}>
                    ProFixIQ
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Customer Portal
                  </div>
                </div>
                <button
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>

              <nav className="space-y-1 px-3">
                {NAV.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cx(
                        "flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition",
                        active
                          ? "border-white/10 bg-white/5"
                          : "border-transparent text-neutral-200 hover:border-white/10 hover:bg-white/5",
                      )}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="font-semibold">{item.label}</span>
                      {active ? (
                        <span
                          className="ml-auto h-2 w-2 rounded-full"
                          style={{ backgroundColor: COPPER }}
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>

              <div className="px-5 py-5 text-xs text-neutral-500">
                Powered by ProFixIQ
              </div>
            </div>
          </div>
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-white/10 bg-black/20 backdrop-blur-md">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <button
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 md:hidden"
                  onClick={() => setOpen(true)}
                  aria-label="Open menu"
                >
                  ☰
                </button>

                <div>
                  <div className="text-sm font-semibold text-neutral-50">
                    {title}
                  </div>
                  <div className="text-xs text-neutral-400">{subtitle}</div>
                </div>
              </div>

              <Link
                href="/portal/booking"
                className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 sm:inline-flex"
              >
                <span style={{ color: COPPER }}>Book</span>
              </Link>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-4 sm:p-6">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md sm:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}