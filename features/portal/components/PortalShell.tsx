"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Car,
  ClipboardCheck,
  FileText,
  History,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import PortalNotificationsBell from "@/features/portal/components/PortalNotificationsBell";
import PortalAssistantEntry from "@/features/portal/components/PortalAssistantEntry";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/status", label: "My service", icon: Wrench },
  { href: "/portal/messages", label: "Messages", icon: MessageCircle },
  {
    href: "/portal/request/when",
    label: "Request service",
    icon: ClipboardCheck,
  },
  {
    href: "/portal/customer-appointments",
    label: "Appointments",
    icon: CalendarDays,
  },
];

const ACCOUNT_NAV: NavItem[] = [
  { href: "/portal/approvals", label: "Approvals", icon: FileText },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
  { href: "/portal/vehicles", label: "Vehicles", icon: Car },
  { href: "/portal/history", label: "Service history", icon: History },
  { href: "/portal/profile", label: "My profile", icon: UserRound },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

const NAV = [...PRIMARY_NAV, ...ACCOUNT_NAV];
const COPPER = "#C57A4A";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function isPortalAuth(pathname: string): boolean {
  return pathname === "/portal/auth" || pathname.startsWith("/portal/auth/");
}

function PortalNavLink({
  item,
  active,
  expanded,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={expanded ? undefined : item.label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group flex min-h-11 items-center rounded-xl border text-sm font-semibold transition",
        expanded ? "gap-3 px-3" : "justify-center px-2",
        active
          ? "border-[rgba(197,122,74,0.42)] bg-[rgba(197,122,74,0.14)] text-[var(--accent-copper-light)]"
          : "border-transparent text-[color:var(--theme-text-secondary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {expanded ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

export default function PortalShell({
  title = "Customer Portal",
  subtitle = "Your service, appointments, approvals, and messages",
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const lightweightFrame =
    isPortalAuth(pathname) ||
    pathname.startsWith("/portal/shop/") ||
    pathname.startsWith("/portal/join/");
  const nestedPortal =
    pathname.startsWith("/portal/fleet") ||
    pathname.startsWith("/portal/property");

  const activeHref = useMemo(() => {
    const exact = NAV.find((item) => item.href === pathname);
    if (exact) return exact.href;
    if (pathname.startsWith("/portal/request/")) return "/portal/request/when";
    if (
      pathname.startsWith("/portal/work-orders/") ||
      pathname.startsWith("/portal/quotes/")
    ) {
      return "/portal/status";
    }
    return (
      NAV.find(
        (item) => item.href !== "/portal" && pathname.startsWith(item.href),
      )?.href ?? "/portal"
    );
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

  if (isPortalAuth(pathname)) return children;
  if (nestedPortal) return children;

  if (lightweightFrame) {
    return (
      <div className="relative min-h-dvh overflow-x-hidden app-metal-bg text-[color:var(--theme-text-primary)]">
        <div className="pointer-events-none absolute inset-0 bg-[var(--theme-gradient-panel)]" />
        <header className="metal-bar sticky top-0 z-40 flex min-h-14 items-center justify-between px-4 shadow-[var(--theme-shadow-medium)]">
          <Link href="/portal" className="flex flex-col leading-none">
            <span
              className="font-blackops text-xs tracking-[0.22em]"
              style={{ color: COPPER }}
            >
              PROFIXIQ
            </span>
            <span className="mt-1 text-[0.65rem] text-[color:var(--theme-text-secondary)]">
              Customer Portal
            </span>
          </Link>
          <Link
            href="/portal"
            className="inline-flex min-h-9 items-center rounded-full border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold"
          >
            Portal home
          </Link>
        </header>
        <main className="relative min-h-[calc(100dvh-56px)] w-full">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden app-metal-bg text-[color:var(--theme-text-primary)]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-20%] h-[62rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.10),transparent_62%)]" />
        <div className="absolute inset-0 bg-[var(--theme-gradient-panel)]" />
      </div>

      <header className="metal-bar sticky top-0 z-40 flex min-h-14 items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-3 shadow-[var(--theme-shadow-medium)] sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open portal menu"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] active:scale-95 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setDesktopExpanded((value) => !value)}
            aria-label={
              desktopExpanded ? "Collapse portal menu" : "Expand portal menu"
            }
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] active:scale-95 lg:inline-flex"
          >
            {desktopExpanded ? (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {title}
            </p>
            <p className="hidden truncate text-[11px] text-[color:var(--theme-text-secondary)] sm:block">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PortalNotificationsBell />
          <PortalAssistantEntry />
          <Link
            href="/portal/messages"
            className="hidden min-h-9 items-center rounded-full border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold md:inline-flex"
          >
            Messages
          </Link>
          <Link
            href="/portal/request/when"
            className="hidden min-h-9 items-center rounded-full bg-[var(--accent-copper)] px-3 text-xs font-semibold text-[color:var(--theme-text-on-accent)] sm:inline-flex"
          >
            Request service
          </Link>
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-[1400px] gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:gap-5 lg:px-6">
        <aside
          className={cx(
            "sticky top-[72px] hidden h-[calc(100dvh-88px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card backdrop-blur-xl transition-[width] duration-200 lg:flex",
            desktopExpanded ? "w-64" : "w-[72px]",
          )}
        >
          <Link
            href="/portal"
            className={cx(
              "flex h-16 shrink-0 items-center border-b border-[color:var(--theme-border-soft)]",
              desktopExpanded ? "gap-3 px-4" : "justify-center px-2",
            )}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[rgba(197,122,74,0.35)] bg-[rgba(197,122,74,0.12)] font-blackops text-xs"
              style={{ color: COPPER }}
            >
              P
            </span>
            {desktopExpanded ? (
              <span className="min-w-0">
                <span
                  className="block font-blackops text-sm tracking-[0.16em]"
                  style={{ color: COPPER }}
                >
                  PROFIXIQ
                </span>
                <span className="block text-[10px] text-[color:var(--theme-text-muted)]">
                  Customer Portal
                </span>
              </span>
            ) : null}
          </Link>

          <nav
            className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
            aria-label="Portal navigation"
          >
            {PRIMARY_NAV.map((item) => (
              <PortalNavLink
                key={item.href}
                item={item}
                active={item.href === activeHref}
                expanded={desktopExpanded}
              />
            ))}
            <div className="my-2 border-t border-[color:var(--theme-border-soft)]" />
            {ACCOUNT_NAV.map((item) => (
              <PortalNavLink
                key={item.href}
                item={item}
                active={item.href === activeHref}
                expanded={desktopExpanded}
              />
            ))}
          </nav>

          <div className="border-t border-[color:var(--theme-border-soft)] p-2">
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              title={desktopExpanded ? undefined : "Sign out"}
              className={cx(
                "flex min-h-11 w-full items-center rounded-xl border border-transparent text-sm font-semibold text-[color:var(--theme-text-secondary)] transition hover:border-red-400/25 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-60",
                desktopExpanded ? "gap-3 px-3" : "justify-center px-2",
              )}
            >
              <LogOut
                className="h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              />
              {desktopExpanded
                ? signingOut
                  ? "Signing out…"
                  : "Sign out"
                : null}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close portal menu"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-[360px] flex-col border-r border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-2xl">
            <div className="flex min-h-16 items-center justify-between border-b border-[color:var(--theme-border-soft)] px-4">
              <div>
                <p
                  className="font-blackops text-base tracking-[0.16em]"
                  style={{ color: COPPER }}
                >
                  PROFIXIQ
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                  Customer Portal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3"
              aria-label="Mobile portal navigation"
            >
              {PRIMARY_NAV.map((item) => (
                <PortalNavLink
                  key={item.href}
                  item={item}
                  active={item.href === activeHref}
                  expanded
                  onClick={() => setMobileOpen(false)}
                />
              ))}
              <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                Account
              </p>
              {ACCOUNT_NAV.map((item) => (
                <PortalNavLink
                  key={item.href}
                  item={item}
                  active={item.href === activeHref}
                  expanded
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>

            <div className="border-t border-[color:var(--theme-border-soft)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 text-sm font-semibold text-red-100 disabled:opacity-60"
              >
                <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
