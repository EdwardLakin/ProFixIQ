"use client";

import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Home,
  LogOut,
  Menu,
  Plus,
  Settings2,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import WorkspaceProductSwitcher from "@/features/shared/components/WorkspaceProductSwitcher";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  clearFieldSurfaceSession,
  readFieldSurfaceSession,
} from "@/features/mobile/service/fieldSurfaceSession";
import type { FieldWorkspaceCapabilities } from "@/features/mobile/service/fieldWorkspaceCapabilities";

const DEFAULT_CAPABILITIES: FieldWorkspaceCapabilities = {
  canManageScheduling: false,
  canManageParts: false,
  canManageOperations: false,
  canManageInspectionTemplates: false,
  canConfigureFieldService: false,
  canInviteFleetMembers: false,
  canSwitchWorkspace: false,
  canReturnToShop: false,
};

type FieldWorkspaceShellProps = {
  children: ReactNode;
  capabilities?: FieldWorkspaceCapabilities;
};

function pageTitle(pathname: string): string {
  if (pathname === "/mobile/service") return "Today";
  if (pathname.startsWith("/mobile/service/new")) return "New service call";
  if (pathname.startsWith("/mobile/service/setup")) return "Field setup";
  if (pathname.startsWith("/mobile/appointments")) return "Schedule";
  if (pathname.startsWith("/mobile/inspections")) return "Inspections";
  if (pathname.startsWith("/mobile/parts")) return "Parts";
  if (pathname.startsWith("/mobile/work-orders")) return "Work orders";
  return "Field";
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
    <nav className="field-workspace-nav" aria-label="Field navigation">
      <Link
        href="/mobile/service"
        onClick={onNavigate}
        data-active={pathname === "/mobile/service" ? "true" : "false"}
        className="field-workspace-nav__link"
      >
        <Home aria-hidden className="h-[1.1rem] w-[1.1rem]" />
        <span>Today</span>
      </Link>
      {capabilities.canManageScheduling ? (
        <Link
          href="/mobile/appointments"
          onClick={onNavigate}
          data-active={
            pathname.startsWith("/mobile/appointments") ? "true" : "false"
          }
          className="field-workspace-nav__link"
        >
          <CalendarDays aria-hidden className="h-[1.1rem] w-[1.1rem]" />
          <span>Schedule</span>
        </Link>
      ) : null}
      <Link
        href="/mobile/inspections"
        onClick={onNavigate}
        data-active={
          pathname.startsWith("/mobile/inspections") ? "true" : "false"
        }
        className="field-workspace-nav__link"
      >
        <ClipboardCheck aria-hidden className="h-[1.1rem] w-[1.1rem]" />
        <span>Inspections</span>
      </Link>
      {capabilities.canManageParts ? (
        <Link
          href="/mobile/parts"
          onClick={onNavigate}
          data-active={pathname.startsWith("/mobile/parts") ? "true" : "false"}
          className="field-workspace-nav__link"
        >
          <Wrench aria-hidden className="h-[1.1rem] w-[1.1rem]" />
          <span>Parts</span>
        </Link>
      ) : null}
      {capabilities.canManageOperations ? (
        <Link
          href="/mobile/work-orders"
          onClick={onNavigate}
          data-active={
            pathname.startsWith("/mobile/work-orders") ? "true" : "false"
          }
          className="field-workspace-nav__link"
        >
          <Building2 aria-hidden className="h-[1.1rem] w-[1.1rem]" />
          <span>Work orders</span>
        </Link>
      ) : null}
    </nav>
  );
}

export default function FieldWorkspaceShell({
  children,
  capabilities,
}: FieldWorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sessionCapabilities, setSessionCapabilities] = useState<
    FieldWorkspaceCapabilities | null
  >(null);

  const workspaceCapabilities = useMemo(
    () => capabilities ?? sessionCapabilities ?? DEFAULT_CAPABILITIES,
    [capabilities, sessionCapabilities],
  );

  useEffect(() => {
    if (capabilities) return;
    const stored = readFieldSurfaceSession();
    if (stored?.workspaceCapabilities) {
      setSessionCapabilities(stored.workspaceCapabilities);
    }
  }, [capabilities]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    if (capabilities) return () => { active = false; };

    const loadCapabilities = async () => {
      try {
        const response = await fetch("/api/mobile/service/access", {
          credentials: "include",
          cache: "no-store",
        });
        if (!active || !response.ok) return;
        const payload = (await response.json()) as {
          workspaceCapabilities?: FieldWorkspaceCapabilities;
        };
        if (payload.workspaceCapabilities) {
          setSessionCapabilities(payload.workspaceCapabilities);
        }
      } catch {
        // The field route gate remains authoritative; keep conservative controls.
      }
    };

    void loadCapabilities();
    return () => {
      active = false;
    };
  }, [capabilities]);

  const exitField = () => {
    clearFieldSurfaceSession();
    setMenuOpen(false);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut({ scope: "local" });
      clearFieldSurfaceSession();
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

        <div className="px-3 pb-2">
          <WorkspaceProductSwitcher surface="field" />
        </div>

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
          {workspaceCapabilities.canReturnToShop ? (
            <Link href="/mobile" onClick={exitField} className="field-workspace-nav__link">
              <Building2 aria-hidden className="h-[1.1rem] w-[1.1rem]" />
              <span>Back to Shop Mobile</span>
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
          <div className="field-workspace-header__title">
            {pageTitle(pathname)}
          </div>
        </div>
        <Link
          href="/mobile/service/new"
          aria-label="Create service call"
          className="field-workspace-header__add"
        >
          <Plus aria-hidden className="h-5 w-5" />
        </Link>
      </header>

      <div className="border-b border-[color:var(--theme-border-soft)] px-3 py-2 lg:hidden">
        <WorkspaceProductSwitcher surface="field" />
      </div>

      <main className="field-workspace-main">{children}</main>

      <nav
        className="field-workspace-bottom"
        aria-label="Field quick navigation"
      >
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
        <Link
          href="/mobile/service/new"
          data-active={pathname.startsWith("/mobile/service/new") ? "true" : "false"}
        >
          <Plus aria-hidden className="h-5 w-5" />
          <span>New</span>
        </Link>
      </nav>

      {menuOpen ? (
        <div className="field-workspace-drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close Field navigation"
            className="field-workspace-drawer__backdrop"
            onClick={() => setMenuOpen(false)}
          />
          <div className="field-workspace-drawer__panel">
            <div className="field-workspace-drawer__header">
              <strong>ProFixIQ Field</strong>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close Field navigation"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <FieldNavigation
              pathname={pathname}
              capabilities={workspaceCapabilities}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
