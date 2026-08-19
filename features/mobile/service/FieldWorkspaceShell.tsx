"use client";

import {
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Home,
  LogOut,
  Menu,
  PackageOpen,
  PackagePlus,
  Plus,
  RadioTower,
  ReceiptText,
  Settings2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  canUseFieldWorkspaceCapability,
  EMPTY_FIELD_WORKSPACE_CAPABILITIES,
  normalizeFieldWorkspaceCapabilities,
  type FieldWorkspaceCapabilities,
} from "./fieldWorkspaceCapabilities";

export const FIELD_SURFACE_SESSION_KEY = "profixiq:field-surface:v1";

type FieldNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  requiredCapability?: keyof FieldWorkspaceCapabilities;
};

const WORK_NAV: FieldNavItem[] = [
  {
    label: "Today",
    href: "/mobile/service",
    icon: Home,
    exact: true,
  },
  {
    label: "Appointments",
    href: "/mobile/appointments",
    icon: CalendarDays,
    requiredCapability: "canManageScheduling",
  },
  {
    label: "Dispatch",
    href: "/mobile/service/dispatch",
    icon: RadioTower,
    requiredCapability: "canManageScheduling",
  },
  {
    label: "Work orders",
    href: "/mobile/work-orders",
    icon: BriefcaseBusiness,
  },
  {
    label: "Inspections",
    href: "/mobile/inspections",
    icon: ClipboardCheck,
  },
];

const OPERATIONS_NAV: FieldNavItem[] = [
  {
    label: "Invoices & history",
    href: "/mobile/service/invoices",
    icon: ReceiptText,
    requiredCapability: "canManageOperations",
  },
  {
    label: "Truck inventory",
    href: "/mobile/service/truck-inventory",
    icon: PackageOpen,
  },
  {
    label: "Parts",
    href: "/mobile/parts",
    icon: Boxes,
    exact: true,
    requiredCapability: "canManageParts",
  },
  {
    label: "Purchase orders",
    href: "/mobile/service/purchase-orders",
    icon: PackagePlus,
    requiredCapability: "canManageParts",
  },
  {
    label: "Follow-ups",
    href: "/mobile/service/followups",
    icon: Wrench,
  },
];

function isActive(pathname: string, item: FieldNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function pageTitle(pathname: string): string {
  if (pathname === "/mobile/service") return "Field Hub";
  if (pathname.startsWith("/mobile/service/purchase-orders")) {
    return "Purchase orders";
  }
  if (pathname.startsWith("/mobile/service/new")) return "New service call";
  if (pathname.startsWith("/mobile/service/jobs")) return "Active field work";
  if (pathname.startsWith("/mobile/service/dispatch")) return "Dispatch";
  if (pathname.startsWith("/mobile/service/invoices")) {
    return "Invoices & history";
  }
  if (pathname.startsWith("/mobile/service/truck-inventory")) {
    return "Truck inventory";
  }
  if (pathname.startsWith("/mobile/service/followup")) return "Follow-ups";
  if (pathname.startsWith("/mobile/service/closeout")) return "Field closeout";
  if (pathname.startsWith("/mobile/appointments")) return "Appointments";
  if (pathname.startsWith("/mobile/work-orders")) return "Work orders";
  if (pathname.startsWith("/mobile/inspections")) return "Inspections";
  if (pathname.startsWith("/mobile/parts")) return "Parts";
  if (pathname.startsWith("/mobile/fleet")) return "Fleet";
  return "Field";
}

function FieldNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: FieldNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="field-workspace-nav__link"
      data-active={isActive(pathname, item) ? "true" : "false"}
    >
      <Icon aria-hidden className="h-[1.1rem] w-[1.1rem]" />
      <span>{item.label}</span>
    </Link>
  );
}

function FieldNavigation({
  pathname,
  capabilities,
  onNavigate,
}: {
  pathname: string;
  capabilities: FieldWorkspaceCapabilities;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Field workspace">
      <div className="field-workspace-nav__section">
        <div className="field-workspace-nav__label">Work</div>
        {WORK_NAV.filter((item) =>
          canUseFieldWorkspaceCapability(
            capabilities,
            item.requiredCapability,
          ),
        ).map((item) => (
          <FieldNavLink
            key={item.href}
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <div className="field-workspace-nav__section">
        <div className="field-workspace-nav__label">Operations</div>
        {OPERATIONS_NAV.filter((item) =>
          canUseFieldWorkspaceCapability(
            capabilities,
            item.requiredCapability,
          ),
        ).map((item) => (
          <FieldNavLink
            key={item.href}
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

export default function FieldWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workspaceCapabilities, setWorkspaceCapabilities] =
    useState<FieldWorkspaceCapabilities>(EMPTY_FIELD_WORKSPACE_CAPABILITIES);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    let active = true;

    void fetch("/api/mobile/field-service/access", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | {
              canAccessFieldService?: boolean;
              workspaceCapabilities?: unknown;
            }
          | null;
        if (!active || !response.ok || !body?.canAccessFieldService) return;
        setWorkspaceCapabilities(
          normalizeFieldWorkspaceCapabilities(body.workspaceCapabilities),
        );
      })
      .catch(() => {
        // Keep optional navigation hidden when capabilities cannot be verified.
      });

    return () => {
      active = false;
    };
  }, []);

  const exitField = () => {
    window.sessionStorage.removeItem(FIELD_SURFACE_SESSION_KEY);
    setMenuOpen(false);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut({ scope: "local" });
      window.sessionStorage.removeItem(FIELD_SURFACE_SESSION_KEY);
      router.replace("/field/sign-in");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="profixiq-mobile-command field-workspace">
      <aside className="field-workspace-sidebar">
        <Link href="/mobile/service" className="field-workspace-brand">
          <span className="field-workspace-brand__mark">PF</span>
          <span>
            <strong>ProFixIQ</strong>
            <small>Field</small>
          </span>
        </Link>

        <Link href="/mobile/service/new" className="field-workspace-new-call">
          <Plus aria-hidden className="h-5 w-5" /> New service call
        </Link>

        <div className="field-workspace-sidebar__scroll">
          <FieldNavigation
            pathname={pathname}
            capabilities={workspaceCapabilities}
          />
        </div>

        <div className="field-workspace-sidebar__footer">
          {workspaceCapabilities.canConfigureFieldService ? (
            <Link
              href="/mobile/service/setup"
              className="field-workspace-nav__link"
            >
              <Settings2 aria-hidden className="h-[1.1rem] w-[1.1rem]" />
              <span>Field setup</span>
            </Link>
          ) : null}
          {workspaceCapabilities.canSwitchWorkspace ? (
            <Link
              href="/sign-in"
              onClick={exitField}
              className="field-workspace-exit"
            >
              Switch workspace
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="field-workspace-nav__link field-workspace-sign-out"
          >
            <LogOut aria-hidden className="h-[1.1rem] w-[1.1rem]" />
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <header className="field-workspace-header">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open Field navigation"
          aria-expanded={menuOpen}
          className="field-workspace-header__menu"
        >
          <Menu aria-hidden className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="field-workspace-header__eyebrow">ProFixIQ Field</div>
          <div className="field-workspace-header__title">{pageTitle(pathname)}</div>
        </div>
        <Link
          href="/mobile/service/new"
          aria-label="Create service call"
          className="field-workspace-header__add"
        >
          <Plus aria-hidden className="h-5 w-5" />
        </Link>
      </header>

      <main className="field-workspace-main">{children}</main>

      <nav className="field-workspace-bottom" aria-label="Field quick navigation">
        <Link
          href="/mobile/service"
          data-active={pathname === "/mobile/service" ? "true" : "false"}
        >
          <Home aria-hidden className="h-5 w-5" />
          <span>Today</span>
        </Link>
        {workspaceCapabilities.canManageScheduling ? (
          <Link
            href="/mobile/appointments"
            data-active={
              pathname.startsWith("/mobile/appointments") ? "true" : "false"
            }
          >
            <CalendarDays aria-hidden className="h-5 w-5" />
            <span>Schedule</span>
          </Link>
        ) : (
          <Link
            href="/mobile/inspections"
            data-active={
              pathname.startsWith("/mobile/inspections") ? "true" : "false"
            }
          >
            <ClipboardCheck aria-hidden className="h-5 w-5" />
            <span>Inspect</span>
          </Link>
        )}
        <Link href="/mobile/service/new" className="field-workspace-bottom__new">
          <Plus aria-hidden className="h-6 w-6" />
          <span>New</span>
        </Link>
        <Link
          href="/mobile/service/jobs"
          data-active={
            pathname.startsWith("/mobile/service/jobs") ||
            pathname.startsWith("/mobile/work-orders")
              ? "true"
              : "false"
          }
        >
          <BriefcaseBusiness aria-hidden className="h-5 w-5" />
          <span>Work</span>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open more Field tools"
        >
          <Menu aria-hidden className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      <button
        type="button"
        aria-label="Close Field navigation"
        onClick={() => setMenuOpen(false)}
        className="field-workspace-drawer__backdrop"
        data-open={menuOpen ? "true" : "false"}
      />
      <aside
        className="field-workspace-drawer"
        data-open={menuOpen ? "true" : "false"}
        aria-hidden={!menuOpen}
        aria-label="Field navigation"
        aria-modal="true"
        inert={menuOpen ? undefined : true}
        role="dialog"
      >
        <div className="field-workspace-drawer__header">
          <div>
            <strong>ProFixIQ Field</strong>
            <small>Full operations workspace</small>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close Field navigation"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="field-workspace-drawer__scroll">
          <Link
            href="/mobile/service/new"
            onClick={() => setMenuOpen(false)}
            className="field-workspace-new-call"
          >
            <Plus aria-hidden className="h-5 w-5" /> New service call
          </Link>
          <FieldNavigation
            pathname={pathname}
            capabilities={workspaceCapabilities}
            onNavigate={() => setMenuOpen(false)}
          />
          <div className="field-workspace-nav__section">
            <div className="field-workspace-nav__label">Workspace</div>
            {workspaceCapabilities.canConfigureFieldService ? (
              <FieldNavLink
                item={{
                  label: "Field setup",
                  href: "/mobile/service/setup",
                  icon: Settings2,
                }}
                pathname={pathname}
                onNavigate={() => setMenuOpen(false)}
              />
            ) : null}
          </div>
        </div>
        <div className="field-workspace-drawer__footer">
          {workspaceCapabilities.canSwitchWorkspace ? (
            <Link href="/sign-in" onClick={exitField}>
              Switch workspace
            </Link>
          ) : null}
          <button type="button" onClick={() => void signOut()} disabled={signingOut}>
            <LogOut aria-hidden className="h-4 w-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
    </div>
  );
}
