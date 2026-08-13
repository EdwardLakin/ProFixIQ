"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Activity, Bot, Gauge, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { cn } from "@shared/lib/utils";

const NAVIGATION = [
  { href: "/ops", label: "Overview", icon: Gauge },
  { href: "/ops/system-health", label: "System Health", icon: Activity },
  { href: "/ops/agent-control", label: "Agent Control", icon: Bot },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/ops") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function OpsShell({
  operatorEmail,
  children,
}: {
  operatorEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await createBrowserSupabase().auth.signOut();
      router.replace("/sign-in?redirect=/ops");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const navigation = (
    <>
      {NAVIGATION.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
              active
                ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                : "border-transparent text-[color:var(--theme-text-secondary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-dvh bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] md:hidden"
              aria-label="Open operations navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link href="/ops" className="flex items-center gap-3">
              <span className="font-blackops text-lg tracking-[0.15em] text-orange-400">
                PROFIXIQ
              </span>
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
                Operations
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 text-xs text-[color:var(--theme-text-secondary)] sm:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>{operatorEmail}</span>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)] disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">
                {signingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 border-r border-[color:var(--theme-border-soft)] p-4 md:block">
          <nav className="space-y-1" aria-label="Operations navigation">
            {navigation}
          </nav>
          <div className="absolute bottom-5 left-4 right-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Owner-only access
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[color:var(--theme-text-muted)]">
              Authorization is verified on every ops page and API request.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setMenuOpen(false)}
            aria-label="Close operations navigation"
          />
          <aside className="absolute inset-y-0 left-0 w-[82vw] max-w-xs border-r border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-blackops tracking-[0.14em] text-orange-400">
                OPS
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)]"
                aria-label="Close operations navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="space-y-1" aria-label="Operations navigation">
              {navigation}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
