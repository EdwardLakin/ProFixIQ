// app/portal/fleet/FleetShell.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ForcePasswordChangeModal from "@/features/auth/components/ForcePasswordChangeModal";

type DB = Database;

type NavItem = {
  href: string;
  label: string;
};

const NAV: NavItem[] = [
  { href: "/portal/fleet", label: "Dashboard" },
  { href: "/portal/fleet/service-requests", label: "Service Requests" },
  { href: "/portal/fleet/pretrip-history", label: "Pre-trip History" },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Keep ProFixIQ copper for brand mark, but give Fleet its own accent
const COPPER = "#C57A4A";
const FLEET_ACCENT = "#38BDF8"; // cyan/teal “ops” vibe

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
          ? "border-white/16 bg-white/8 text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
          : "border-white/10 bg-black/20 text-neutral-200 hover:border-white/16 hover:bg-white/6",
      )}
    >
      <span className="font-semibold">{label}</span>
      <span
        className={cx(
          "h-2 w-2 rounded-full transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-80",
        )}
        style={{ backgroundColor: FLEET_ACCENT }}
      />
    </Link>
  );
}

export default function FleetShell({
  title = "Fleet Portal",
  subtitle = "Dispatch view for pre-trips, service requests, and fleet history",
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const activeHref = useMemo(() => {
    const exact = NAV.find((x) => x.href === pathname);
    if (exact) return exact.href;

    const starts = NAV.find(
      (x) => x.href !== "/portal/fleet" && pathname.startsWith(x.href),
    );
    return starts?.href ?? "/portal/fleet";
  }, [pathname]);

  // Load session + must_change_password (fleet portal)
  useEffect(() => {
    let alive = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user?.id ?? null;
      if (!alive) return;

      setUserId(uid);

      if (!uid) return;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", uid)
          .single();

        if (!alive) return;
        setMustChangePassword(!!profile?.must_change_password);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "Failed to load profile must_change_password (FleetShell)",
          err,
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

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

  const ShellCard =
    "rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card sm:p-6";

  return (
    <div className="relative min-h-dvh text-white overflow-hidden">
      {/* ✅ Fleet-specific background (distinct from customer portal) */}
      <div className="pointer-events-none absolute inset-0">
        {/* deep base */}
        <div className="absolute inset-0 bg-[#020617]" />
        {/* subtle grid (ops/dispatch vibe) */}
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(56,189,248,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.18)_1px,transparent_1px)] [background-size:44px_44px]" />
        {/* cyan halo */}
        <div className="absolute left-1/2 top-[-18%] h-[70rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.20),transparent_60%)]" />
        {/* secondary slate bloom */}
        <div className="absolute right-[-22%] top-[20%] h-[52rem] w-[52rem] rounded-full bg-[radial-gradient(circle,rgba(148,163,184,0.10),transparent_60%)]" />
        {/* bottom vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(15,23,42,0.88),transparent_70%)]" />
      </div>

      {/* ✅ Removed `relative` to avoid cssConflict with `sticky` */}
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 active:scale-95 md:hidden"
          >
            <MenuIcon />
          </button>

          <button
            type="button"
            onClick={() => setDesktopOpen((v) => !v)}
            aria-label="Toggle sidebar"
            className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 active:scale-95"
          >
            <MenuIcon />
          </button>

          <div className="flex items-start gap-3">
            <div className="flex flex-col">
              <div className="text-[0.75rem] font-medium text-neutral-100">
                {title}
              </div>
              <div className="text-[0.65rem] text-neutral-400">{subtitle}</div>
            </div>

            {/* Fleet badge */}
            <div
              className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]"
              style={{ color: FLEET_ACCENT }}
            >
              Fleet Ops
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/portal/fleet"
            className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-[0.7rem] font-semibold text-neutral-100 transition hover:bg-black/70 active:scale-95"
          >
            <span style={{ color: FLEET_ACCENT }}>Dashboard</span>
          </Link>

          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-[0.7rem] font-semibold text-neutral-100 transition hover:bg-black/70 active:scale-95 disabled:opacity-60"
            title="Sign out"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-6xl flex-col gap-4 px-3 py-4 md:flex-row md:gap-6 md:px-6">
        {/* Desktop sidebar */}
        <aside
          className={cx(
            "hidden overflow-hidden rounded-2xl border border-white/10 bg-black/25 backdrop-blur-md shadow-card md:flex md:flex-col transition-all duration-300",
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
              <div className="flex items-baseline justify-between">
                <div
                  className="font-blackops text-lg tracking-[0.16em]"
                  style={{ color: COPPER }}
                >
                  PROFIXIQ
                </div>
                <div
                  className="text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: FLEET_ACCENT }}
                >
                  Fleet
                </div>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                Dispatch & ops view
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

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[82vw] max-w-[360px] border-r border-white/10 bg-black/85 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
                <div>
                  <div className="flex items-baseline gap-2">
                    <div
                      className="font-blackops text-lg tracking-[0.16em]"
                      style={{ color: COPPER }}
                    >
                      PROFIXIQ
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-[0.22em]"
                      style={{ color: FLEET_ACCENT }}
                    >
                      Fleet
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Dispatch & ops view
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-neutral-100"
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

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className={ShellCard}>{children}</div>
        </div>
      </div>

      {/* ✅ Force password change modal (blocks portal until complete) */}
      <ForcePasswordChangeModal
        open={!!userId && mustChangePassword}
        onDone={() => {
          setMustChangePassword(false);
          router.refresh();
        }}
      />
    </div>
  );
}