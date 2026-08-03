"use client";

import { Menu } from "lucide-react";
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
  if (pathname.startsWith("/mobile/jobs/")) return "Focused job";
  if (pathname.startsWith("/mobile/work-orders/create")) return "Create work order";
  if (/^\/mobile\/work-orders\/[^/]+/.test(pathname)) return "Work order";
  if (pathname.startsWith("/mobile/work-orders")) return "Work orders";
  if (pathname.startsWith("/mobile/appointments")) return "Appointments";
  if (pathname.startsWith("/mobile/inspections/import")) return "Import inspection";
  if (pathname.startsWith("/mobile/inspections")) return "Inspections";
  if (pathname.startsWith("/mobile/parts")) return "Parts workflow";
  if (pathname.startsWith("/mobile/messages")) return "Team chat";
  if (pathname.startsWith("/mobile/tech/queue")) return "My jobs";
  if (pathname.startsWith("/mobile/tech/performance")) return "My performance";
  if (pathname.startsWith("/mobile/workforce/attendance")) return "Attendance";
  if (pathname.startsWith("/mobile/fleet/service-requests")) return "Service requests";
  if (pathname.startsWith("/mobile/fleet/pretrip")) return "Pre-trip";
  if (pathname.startsWith("/mobile/fleet")) return "Fleet";
  if (pathname.startsWith("/mobile/assistant")) return "Assistant";
  if (pathname.startsWith("/mobile/planner")) return "Operations planner";
  if (pathname.startsWith("/mobile/offline")) return "Device & sync";
  if (pathname.startsWith("/mobile/settings")) return "Settings";
  if (pathname.startsWith("/mobile/reports")) return "Reports";
  if (pathname.startsWith("/mobile/technicians")) return "Technicians";
  if (pathname.startsWith("/mobile/dispatch")) return "Dispatch";
  return "ProFixIQ";
}

function isImmersiveRoute(pathname: string): boolean {
  if (pathname.startsWith("/mobile/jobs/")) return true;
  if (pathname === "/mobile/inspections/import") return false;
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

function isSharedDestination(pathname: string): boolean {
  return (
    pathname.startsWith("/mobile") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/inspection-reports") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next")
  );
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

      if (mobileHref) {
        if (mobileHref === requestedHref) return;
        event.preventDefault();
        event.stopPropagation();
        if (mobileHref !== currentHref) router.push(mobileHref);
        return;
      }

      if (isSharedDestination(anchor.pathname)) return;

      // Mobile navigation fails closed. A missed desktop-only destination must
      // never open the desktop application shell from inside the mobile app.
      event.preventDefault();
      event.stopPropagation();
      if (currentHref !== "/mobile") router.push("/mobile");
    };

    document.addEventListener("click", keepNavigationMobile, true);
    return () => document.removeEventListener("click", keepNavigationMobile, true);
  }, [router]);

  if (pathname === "/mobile/sign-in" || pathname.startsWith("/mobile/sign-in/")) {
    return children;
  }

  if (isImmersiveRoute(pathname)) {
    return (
      <div className="profixiq-mobile-command min-h-screen overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
        <main className="mobile-command-main min-w-0 overflow-x-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="profixiq-mobile-command min-h-screen overflow-x-hidden">
      <header className="mobile-command-header">
        <div className="mobile-command-header__inner">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            className="mobile-command-header__menu"
          >
            <Menu aria-hidden className="h-5 w-5" strokeWidth={2.2} />
          </button>

          <div className="mobile-command-header__title">{resolvedTitle}</div>

          <button
            type="button"
            onClick={() => router.push("/mobile")}
            aria-label="Go to mobile home"
            className="mobile-command-header__mark"
          >
            PFIQ
          </button>
        </div>
      </header>

      <main className="mobile-command-main">{children}</main>

      <MobileBottomNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

export default MobileShell;
