// app/portal/PortalShell.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PortalNotificationsBell from "@/features/portal/components/PortalNotificationsBell";

type DB = Database;

type NavItem = {
  href: string;
  label: string;
};

const NAV: NavItem[] = [
  { href: "/portal", label: "Home" },
  { href: "/portal/request/when", label: "Request" },
  { href: "/portal/approvals", label: "Approvals" },
  { href: "/portal/customer-appointments", label: "Appointments" },
  { href: "/portal/history", label: "History" },
  { href: "/portal/invoices", label: "Invoices" },
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

function NavPill({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cx(
        "group flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition",
        active
          ? "border-white/14 bg-white/7 text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
          : "border-white/10 bg-black/20 text-neutral-200 hover:border-white/14 hover:bg-white/5",
      )}
    >
      <span className="font-semibold">{label}</span>
      <span
        className={cx(
          "h-2 w-2 rounded-full transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-70",
        )}
        style={{ backgroundColor: COPPER }}
      />
    </Link>
  );
}

export default function PortalShell({
  title = "Customer Portal",
  subtitle = "Request service, approve parts, manage appointments, vehicles, and your profile",
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

  const hideNav =
    isPortalAuth(pathname) || pathname.startsWith("/portal/shop/");

  const activeHref = useMemo(() => {
    const exact = NAV.find((x) => x.href === pathname);
    if (exact) return exact.href;

    const starts = NAV.find(
      (x) => x.href !== "/portal" && pathname.startsWith(x.href),
    );
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

  // ✅ AUTH PAGES: allow the auth page to own the full viewport/background
  if (hideNav) {
    return (
      <div className="relative min-h-dvh app-metal-bg text-white overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-22%] h-[58rem] w-[58rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(15,23,42,0.88),transparent_68%)]" />
        </div>

        {/* ✅ Removed `relative` to satisfy cssConflict lint */}
        <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col leading-none">
            <span
              className="font-blackops text-xs tracking-[0.22em]"
              style={{ color: COPPER }}
            >
              PROFIXIQ
            </span>
            <span className="text-[0.65rem] text-neutral-300">
              Customer Portal
            </span>
          </div>

          <button
            type="button"
            onClick={() => router.push("/portal")}
            className="desktop-btn-secondary inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.7rem] text-neutral-100 active:scale-95"
          >
            <span className="uppercase tracking-[0.16em]">Home</span>
          </button>
        </header>

        <main className="relative min-h-[calc(100dvh-56px)] w-full">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh app-metal-bg text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[6%] h-[80rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_62%)]" />
        <div className="absolute right-[-18%] top-[28%] h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.06),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(15,23,42,0.82),transparent_70%)]" />
      </div>

      {/* ✅ Removed `relative` to satisfy cssConflict lint */}
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="desktop-btn-secondary inline-flex h-8 w-8 items-center justify-center rounded-full border active:scale-95 md:hidden"
          >
            <MenuIcon />
          </button>

          <button
            type="button"
            onClick={() => setDesktopOpen((v) => !v)}
            aria-label="Toggle sidebar"
            className="desktop-btn-secondary hidden h-8 w-8 items-center justify-center rounded-full border active:scale-95 md:inline-flex"
          >
            <MenuIcon />
          </button>

          <div>
            <div className="text-[0.75rem] font-medium text-neutral-100">
              {title}
            </div>
            <div className="text-[0.65rem] text-neutral-400">{subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PortalNotificationsBell />

          <Link
            href="/portal/request/when"
            className="desktop-btn-primary inline-flex items-center rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition active:scale-95"
          >
            <span>Request</span>
          </Link>

          <Link
            href="/portal/approvals"
            className="desktop-btn-secondary inline-flex items-center rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition active:scale-95"
          >
            <span>Approvals</span>
          </Link>

          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="desktop-btn-secondary inline-flex items-center rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition active:scale-95 disabled:opacity-60"
            title="Sign out"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-6xl flex-col gap-4 px-3 py-4 md:flex-row md:gap-6 md:px-6">
        <aside
          className={cx(
            "desktop-panel-soft hidden overflow-hidden rounded-2xl border backdrop-blur-md shadow-card transition-all duration-300 md:flex md:flex-col",
            desktopOpen
              ? "w-72"
              : "w-0 border-transparent bg-transparent shadow-none",
          )}
        >
          <div
            className={cx(
              "flex h-full flex-col transition-opacity duration-200",
              desktopOpen ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="px-5 py-5">
              <div
                className="font-blackops text-lg tracking-[0.16em]"
                style={{ color: COPPER }}
              >
                PROFIXIQ
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                Customer Portal
              </div>
            </div>

            <nav className="flex-1 space-y-2 px-3 pb-4">
              {NAV.map((item) => (
                <NavPill
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={item.href === activeHref}
                />
              ))}
            </nav>

            <div className="px-5 pb-5 text-xs text-neutral-500">
              Powered by ProFixIQ
            </div>
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[82vw] max-w-[360px] border-r border-white/10 bg-[#020611]/95 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-[color:var(--desktop-border)] px-5 py-5">
                <div>
                  <div
                    className="font-blackops text-lg tracking-[0.16em]"
                    style={{ color: COPPER }}
                  >
                    PROFIXIQ
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Customer Portal
                  </div>
                </div>
                <button
                  className="desktop-btn-secondary rounded-full border px-3 py-1 text-xs text-neutral-100"
                  onClick={() => setMobileOpen(false)}
                >
                  Close
                </button>
              </div>

              <nav className="space-y-2 px-4 py-4">
                {NAV.map((item) => (
                  <NavPill
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    active={item.href === activeHref}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </nav>

              <div className="mt-auto border-t border-white/10 px-5 py-4">
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>

                <div className="mt-3 text-xs text-neutral-500">
                  Powered by ProFixIQ
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="min-h-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
