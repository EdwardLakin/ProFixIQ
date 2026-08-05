"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  History,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";
import ForcePasswordChangeModal from "@/features/auth/components/ForcePasswordChangeModal";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { cn } from "@/features/shared/utils/cn";

type FleetExperience = "internal_ops" | "external_manager" | "external_driver";

type FleetNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  managerOnly?: boolean;
};

type FleetNavGroup = {
  label: string;
  items: FleetNavItem[];
};

const NAV_GROUPS: FleetNavGroup[] = [
  {
    label: "Operate",
    items: [
      {
        href: "/portal/fleet",
        label: "Control Tower",
        shortLabel: "Tower",
        description: "Readiness, risks and work requiring a decision",
        icon: Gauge,
      },
      {
        href: "/portal/fleet/units",
        label: "Assets",
        shortLabel: "Assets",
        description: "Every unit, one complete maintenance record",
        icon: Truck,
      },
      {
        href: "/portal/fleet/drivers",
        label: "Drivers",
        shortLabel: "Drivers",
        description: "Assignments, inspections and reported defects",
        icon: UsersRound,
        managerOnly: true,
      },
      {
        href: "/portal/fleet/pretrip-history",
        label: "Pre-trips & Defects",
        shortLabel: "Pre-trips",
        description: "Driver submissions and defect follow-through",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    label: "Maintain",
    items: [
      {
        href: "/portal/fleet/maintenance",
        label: "PM & Maintenance",
        shortLabel: "Maintenance",
        description: "Due work, deferrals and maintenance programs",
        icon: ShieldCheck,
        managerOnly: true,
      },
      {
        href: "/portal/fleet/calendar",
        label: "Maintenance Calendar",
        shortLabel: "Calendar",
        description: "Planned service, inspections and downtime",
        icon: CalendarDays,
        managerOnly: true,
      },
      {
        href: "/portal/fleet/service-requests",
        label: "Requests & Approvals",
        shortLabel: "Requests",
        description: "Service requests, estimates and decisions",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    label: "Understand",
    items: [
      {
        href: "/portal/fleet/billing",
        label: "History & Costs",
        shortLabel: "Costs",
        description: "Repair history, invoices and asset costs",
        icon: History,
        managerOnly: true,
      },
      {
        href: "/portal/fleet/reports",
        label: "Reports",
        shortLabel: "Reports",
        description: "Compliance, downtime and cost performance",
        icon: ChartNoAxesCombined,
        managerOnly: true,
      },
      {
        href: "/portal/fleet/settings",
        label: "Fleet Settings",
        shortLabel: "Settings",
        description: "Workspace, users, roles and preferences",
        icon: Settings,
        managerOnly: true,
      },
    ],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/portal/fleet") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  item,
  compact,
  active,
  onNavigate,
}: {
  item: FleetNavItem;
  compact: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={cn(
        "group relative flex min-h-12 items-center rounded-xl border transition",
        compact ? "justify-center px-2" : "gap-3 px-3 py-2.5",
        active
          ? "border-sky-400/[0.45] bg-sky-400/[0.12] text-[color:var(--theme-text-primary)] shadow-[0_12px_32px_rgba(14,165,233,0.12)]"
          : "border-transparent text-[color:var(--theme-text-secondary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]",
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-400" />
      ) : null}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition",
          active
            ? "border-sky-400/30 bg-sky-400/[0.15] text-sky-300"
            : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-muted)] group-hover:text-sky-400",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{item.label}</span>
          <span className="mt-0.5 block truncate text-[10px] text-[color:var(--theme-text-muted)]">
            {item.description}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

export default function FleetProductShell({
  title,
  subtitle,
  actorLabel,
  experience,
  userId,
  children,
}: {
  title: string;
  subtitle: string;
  actorLabel: string;
  experience: FleetExperience;
  userId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/portal/fleet";
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    if (!userId) {
      setMustChangePassword(false);
      return;
    }

    let active = true;
    void supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setMustChangePassword(Boolean(data?.must_change_password));
      });

    return () => {
      active = false;
    };
  }, [supabase, userId]);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => experience !== "external_driver" || !item.managerOnly,
        ),
      })).filter((group) => group.items.length > 0),
    [experience],
  );

  const activeItem = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .filter((item) => isActivePath(pathname, item.href))
        .sort((a, b) => b.href.length - a.href.length)[0] ?? null,
    [groups, pathname],
  );

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/portal/auth/fleet-sign-in");
      setSigningOut(false);
    }
  }

  const navigation = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center border-b border-[color:var(--theme-border-soft)]",
          compact && !isMobile ? "justify-center px-2 py-5" : "gap-3 px-4 py-5",
        )}
      >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/[0.12] text-sky-300 shadow-[0_0_30px_rgba(56,189,248,0.12)]">
          <Truck className="h-5 w-5" aria-hidden="true" />
        </div>
        {compact && !isMobile ? null : (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-[color:var(--theme-text-primary)]">
              ProFixIQ <span className="text-sky-400">Fleet</span>
            </div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              Maintenance command
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4" aria-label="Fleet workspace">
        {groups.map((group) => (
          <div key={group.label}>
            {compact && !isMobile ? null : (
              <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  compact={compact && !isMobile}
                  active={activeItem?.href === item.href}
                  onNavigate={isMobile ? () => setMobileOpen(false) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--theme-border-soft)] p-3">
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl border border-transparent text-sm font-medium text-[color:var(--theme-text-secondary)] transition hover:border-red-400/25 hover:bg-red-500/[0.08] hover:text-red-500 disabled:opacity-60 dark:hover:text-red-300",
            compact && !isMobile ? "justify-center px-2" : "gap-3 px-3",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {compact && !isMobile ? null : signingOut ? "Signing out…" : "Sign out"}
        </button>
        {compact && !isMobile ? null : (
          <div className="mt-3 px-3 text-[10px] text-[color:var(--theme-text-muted)]">
            Two products. One connected maintenance record.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[var(--theme-gradient-panel)]" />
        <div className="absolute -left-60 top-[-22rem] h-[46rem] w-[46rem] rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute -right-72 bottom-[-24rem] h-[48rem] w-[48rem] rounded-full bg-blue-600/[0.08] blur-3xl" />
      </div>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-[color:var(--theme-border-soft)] bg-[color:var(--theme-sidebar-bg)]/96 backdrop-blur-xl transition-[width] duration-200 lg:block",
          compact ? "w-[76px]" : "w-[286px]",
        )}
      >
        {navigation(false)}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-[color:var(--theme-backdrop)] backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,340px)] border-r border-[color:var(--theme-border-soft)] bg-[color:var(--theme-sidebar-bg)] shadow-2xl">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
            >
              <X className="h-4 w-4" />
            </button>
            {navigation(true)}
          </aside>
        </div>
      ) : null}

      <div className={cn("relative min-h-dvh transition-[padding] duration-200", compact ? "lg:pl-[76px]" : "lg:pl-[286px]")}>
        <header className="sticky top-0 z-30 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-header-bg)]/88 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-3 sm:px-5 lg:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open fleet navigation"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCompact((value) => !value)}
              aria-label={compact ? "Expand fleet navigation" : "Collapse fleet navigation"}
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)] lg:flex"
            >
              {compact ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{title}</div>
              <div className="truncate text-[11px] text-[color:var(--theme-text-muted)]">
                {subtitle}
              </div>
            </div>

            <div className="hidden items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 sm:flex">
              {experience === "external_driver" ? (
                <UserRound className="h-4 w-4 text-sky-400" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-sky-400" />
              )}
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                  Workspace role
                </div>
                <div className="text-xs font-medium">{actorLabel}</div>
              </div>
            </div>
            <ThemeToggleButton />
          </div>
        </header>

        <main className="relative mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-5 sm:py-6 lg:px-7">
          {children}
        </main>
      </div>

      <ForcePasswordChangeModal
        open={Boolean(userId && mustChangePassword)}
        onDone={() => {
          setMustChangePassword(false);
          router.refresh();
        }}
      />
    </div>
  );
}
