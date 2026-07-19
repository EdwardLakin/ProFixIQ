"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  children: ReactNode;
  title?: string;
};

function getTitleFromPath(pathname: string): string {
  if (!pathname.startsWith("/mobile")) return "ProFixIQ";
  if (pathname === "/mobile") return "Home";
  if (pathname.startsWith("/mobile/jobs/")) return "Job";
  if (pathname.startsWith("/mobile/work-orders/create")) {
    return "Create work order";
  }
  if (pathname.startsWith("/mobile/work-orders")) return "Work orders";
  if (pathname.startsWith("/mobile/appointments")) return "Appointments";
  if (pathname.startsWith("/mobile/inspections")) return "Inspections";
  if (pathname.startsWith("/mobile/parts")) return "Parts";
  if (pathname.startsWith("/mobile/messages")) return "Inbox";
  if (pathname.startsWith("/mobile/tech/queue")) return "My jobs";
  if (pathname.startsWith("/mobile/tech/performance")) {
    return "My performance";
  }
  if (pathname.startsWith("/mobile/workforce/attendance")) {
    return "Attendance";
  }
  if (pathname.startsWith("/mobile/fleet/service-requests")) {
    return "Service requests";
  }
  if (pathname.startsWith("/mobile/fleet/pretrip")) return "Pre-trip";
  if (pathname.startsWith("/mobile/fleet")) return "Fleet";
  if (pathname.startsWith("/mobile/assistant")) return "Assistant";
  if (pathname.startsWith("/mobile/planner")) return "Planner";
  if (pathname.startsWith("/mobile/offline")) return "Offline & sync";
  if (pathname.startsWith("/mobile/settings")) return "Settings";
  if (pathname.startsWith("/mobile/reports")) return "Reports";
  if (pathname.startsWith("/mobile/technicians")) return "Technicians";
  if (pathname.startsWith("/mobile/dispatch")) return "Dispatch";
  return "ProFixIQ";
}

function isImmersiveRoute(pathname: string): boolean {
  if (pathname.startsWith("/mobile/jobs/")) return true;

  // Single-screen inspection runners provide their own Back/header bar. Deeper
  // routes such as /[id]/run still rely on the shared mobile header.
  return /^\/mobile\/inspections\/[^/]+$/.test(pathname);
}

function shouldIgnoreAnchor(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (anchor.hasAttribute("download")) return true;
  if (anchor.dataset.mobileRouteBypass === "true") return true;

  const target = anchor.getAttribute("target");
  return Boolean(target && target !== "_self");
}

export function MobileShell({ children, title }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const resolvedTitle = title ?? getTitleFromPath(pathname);

  useEffect(() => {
    const keepNavigationMobile = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || shouldIgnoreAnchor(anchor, event)) return;
      if (anchor.origin !== window.location.origin) return;

      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const requestedHref = `${anchor.pathname}${anchor.search}${anchor.hash}`;
      const mobileHref = resolveMobileHref(requestedHref);
      if (!mobileHref || mobileHref === requestedHref || mobileHref === currentHref) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      router.push(mobileHref);
    };

    // Listen at document level so links rendered by portals and shared modals
    // cannot accidentally escape from the mobile application shell.
    document.addEventListener("click", keepNavigationMobile, true);
    return () => document.removeEventListener("click", keepNavigationMobile, true);
  }, [router]);

  if (pathname === "/mobile/sign-in" || pathname.startsWith("/mobile/sign-in/")) {
    return children;
  }

  if (isImmersiveRoute(pathname)) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] pt-[env(safe-area-inset-top,0px)] text-[color:var(--theme-text-primary)]">
        <main className="min-w-0 overflow-x-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur-xl">
        <div className="flex h-14 min-w-0 items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] active:scale-95"
            >
              <span className="sr-only">Open menu</span>
              <span className="flex flex-col gap-1">
                <span className="h-0.5 w-4 rounded-full bg-[color:var(--theme-text-primary)]" />
                <span className="h-0.5 w-4 rounded-full bg-[color:var(--theme-text-primary)]" />
                <span className="h-0.5 w-4 rounded-full bg-[color:var(--theme-text-primary)]" />
              </span>
            </button>

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{resolvedTitle}</div>
              <div className="truncate text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                ProFixIQ Mobile
              </div>
            </div>
          </div>

          {pathname !== "/mobile" ? (
            <button
              type="button"
              onClick={() => router.push("/mobile")}
              className="shrink-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs font-medium"
            >
              Home
            </button>
          ) : (
            <span className="font-blackops shrink-0 text-xs tracking-[0.18em] text-[var(--accent-copper)]">
              PROFIXIQ
            </span>
          )}
        </div>
      </header>

      <main className="min-w-0 overflow-x-hidden pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <MobileBottomNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

export default MobileShell;
