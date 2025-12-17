// features/portal/components/PortalShell.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type NavItem = {
  href: string;
  label: string;
};

const NAV: NavItem[] = [
  { href: "/portal", label: "Home" },
  { href: "/portal/booking", label: "Book" },
  { href: "/portal/customer-appointments", label: "Appointments" },
  { href: "/portal/history", label: "History" },
  { href: "/portal/vehicles", label: "Vehicles" },
  { href: "/portal/profile", label: "Profile" },
  { href: "/portal/settings", label: "Settings" },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const COPPER = "#C57A4A";

function isPortalAuth(pathname: string) {
  return pathname === "/portal/auth" || pathname.startsWith("/portal/auth/");
}

function MenuIcon() {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="h-[2px] w-[14px] rounded-full bg-white" />
      <span className="h-[2px] w-[14px] rounded-full bg-white" />
      <span className="h-[2px] w-[14px] rounded-full bg-white" />
    </div>
  );
}

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
  const router = useRouter();
  const supabase = createClientComponentClient<DB>();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const hideNav = isPortalAuth(pathname);

  const activeHref = useMemo(() => {
    const exact = NAV.find((x) => x.href === pathname);
    if (exact) return exact.href;

    const starts = NAV.find((x) => x.href !== "/portal" && pathname.startsWith(x.href));
    return starts?.href ?? "/portal";
  }, [pathname]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
      router.replace("/portal/auth/sign-in");
    }
  };

  // AUTH PAGES: no nav, centered content
  if (hideNav) {
    return (
      <div className="min-h-dvh app-metal-bg text-white">
        <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.9)]">
          <div className="flex flex-col leading-none">
            <span className="font-blackops text-xs tracking-[0.22em]" style={{ color: COPPER }}>
              PROFIXIQ
            </span>
            <span className="text-[0.65rem] text-neutral-300">Customer Portal</span>
          </div>

          <button
            type="button"
            onClick={() => router.push("/portal")}
            className="inline-flex items-center gap-1 rounded-full border border-white/18 bg-black/40 px-3 py-1 text-[0.7rem] text-neutral-100 hover:bg-black/70 active:scale-95"
          >
            <span className="uppercase tracking-[0.16em]">Home</span>
          </button>
        </header>

        <main className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-5xl items-center px-3 py-8">
          {children}
        </main>
      </div>
    );
  }

  const ShellCard =
    "rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card sm:p-6";

  return (
    <div className="min-h-dvh app-metal-bg text-white">
      {/* Top bar */}
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3">
          {/* Mobile drawer */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 active:scale-95 md:hidden"
          >
            <MenuIcon />
          </button>

          {/* Desktop sidebar collapse */}
          <button
            type="button"
            onClick={() => setDesktopOpen((v) => !v)}
            aria-label="Toggle sidebar"
            className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 active:scale-95"
          >
            <MenuIcon />
          </button>

          <div>
            <div className="text-[0.75rem] font-medium text-neutral-100">{title}</div>
            <div className="text-[0.65rem] text-neutral-400">{subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/portal/booking"
            className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-[0.7rem] font-semibold transition hover:bg-black/70 active:scale-95"
            style={{ color: COPPER }}
          >
            Book
          </Link>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-6xl gap-6 px-3 py-4 md:px-6">
        {/* Desktop sidebar (collapsible) */}
        <aside
          className={cx(
            "hidden overflow-hidden rounded-2xl border border-white/10 bg-black/25 backdrop-blur-md shadow-card md:flex md:flex-col transition-all duration-300",
            desktopOpen ? "w-72" : "w-0 border-transparent bg-transparent shadow-none",
          )}
        >
          <div
            className={cx(
              "flex h-full flex-col transition-opacity duration-200",
              desktopOpen ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="px-5 py-5">
              <div className="font-blackops text-lg tracking-[0.16em]" style={{ color: COPPER }}>
                PROFIXIQ
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
                      "flex items-center rounded-xl border px-3 py-2 text-sm transition",
                      active
                        ? "border-white/12 bg-white/6 text-neutral-50"
                        : "border-transparent text-neutral-200 hover:border-white/10 hover:bg-white/5",
                    )}
                  >
                    <span className="font-semibold">{item.label}</span>
                    {active ? (
                      <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="px-5 pb-4">
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>

            <div className="px-5 pb-5 text-xs text-neutral-500">Powered by ProFixIQ</div>
          </div>
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[78vw] max-w-[340px] border-r border-white/10 bg-black/85 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
                <div>
                  <div className="font-blackops text-lg tracking-[0.16em]" style={{ color: COPPER }}>
                    PROFIXIQ
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">Customer Portal</div>
                </div>
                <button
                  className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-neutral-100"
                  onClick={() => setMobileOpen(false)}
                >
                  Close
                </button>
              </div>

              <nav className="space-y-1 px-3 py-3">
                {NAV.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cx(
                        "flex items-center rounded-xl border px-3 py-3 text-sm transition",
                        active
                          ? "border-white/12 bg-white/6 text-neutral-50"
                          : "border-transparent text-neutral-200 hover:border-white/10 hover:bg-white/5",
                      )}
                    >
                      <span className="font-semibold">{item.label}</span>
                      {active ? (
                        <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>

                <div className="mt-3 text-xs text-neutral-500">Powered by ProFixIQ</div>
              </div>
            </div>
          </div>
        )}

        {/* Main column */}
        <div className="min-w-0 flex-1">
          <div className={ShellCard}>{children}</div>
        </div>
      </div>
    </div>
  );
}