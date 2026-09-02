"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { TechnicianCopilotShell } from "@/features/copilot/technician/components/TechnicianCopilotShell";
import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import FieldWorkspaceShell from "@/features/mobile/service/FieldWorkspaceShell";
import {
  clearFieldServiceOfflineAccess,
  readFieldServiceOfflineAccess,
  resolveFieldServiceAccessScope,
  writeFieldServiceOfflineAccess,
  type FieldServiceAccessPayload,
} from "@/features/mobile/service/fieldOfflineAccess";
import {
  clearFieldSurfaceSession,
  readFieldSurfaceSession,
  writeFieldSurfaceSession,
} from "@/features/mobile/service/fieldSurfaceSession";
import {
  getOfflineMutationScope,
  isRetryableOfflineStatus,
  setOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import {
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
} from "@/features/shared/lib/route-load";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  children: ReactNode;
  title?: string;
};

function getTitleFromPath(pathname: string): string {
  if (!pathname.startsWith("/mobile")) return "ProFixIQ";
  if (pathname === "/mobile") return "Home";
  if (pathname.startsWith("/mobile/service")) return "Field Service";
  if (pathname.startsWith("/mobile/jobs/")) return "Focused job";
  if (pathname.startsWith("/mobile/work-orders/create"))
    return "Create work order";
  if (/^\/mobile\/work-orders\/[^/]+/.test(pathname)) return "Work order";
  if (pathname.startsWith("/mobile/work-orders")) return "Work orders";
  if (pathname.startsWith("/mobile/appointments")) return "Appointments";
  if (pathname === "/mobile/inspections/import") return "Import form";
  if (pathname.startsWith("/mobile/inspections")) return "Inspections";
  if (pathname.startsWith("/mobile/parts")) return "Parts workflow";
  if (pathname.startsWith("/mobile/messages")) return "Team chat";
  if (pathname.startsWith("/mobile/tech/queue")) return "My jobs";
  if (pathname.startsWith("/mobile/tech/performance")) return "My performance";
  if (pathname.startsWith("/mobile/workforce/attendance")) return "Attendance";
  if (pathname.startsWith("/mobile/fleet/service-requests"))
    return "Service requests";
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

function shouldIgnoreAnchor(
  anchor: HTMLAnchorElement,
  event: MouseEvent,
): boolean {
  if (event.defaultPrevented || event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return true;
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
  const [fieldSurface, setFieldSurface] = useState(
    pathname.startsWith("/mobile/service"),
  );
  const [fieldVerificationPending, setFieldVerificationPending] = useState(
    pathname.startsWith("/mobile/service"),
  );
  const [verifiedFieldPathname, setVerifiedFieldPathname] = useState<
    string | null
  >(null);
  const [fieldVerificationAttempt, setFieldVerificationAttempt] = useState(0);
  const preserveFieldSurfaceOnNextVerification = useRef(false);
  const resolvedTitle = title ?? getTitleFromPath(pathname);

  useEffect(() => {
    let active = true;
    const isFieldRoute = pathname.startsWith("/mobile/service");
    const verifyFieldSurface = async () => {
      const preserveCurrentFieldSurface =
        preserveFieldSurfaceOnNextVerification.current;
      preserveFieldSurfaceOnNextVerification.current = false;

      if (
        pathname === "/mobile" ||
        pathname === "/mobile/sign-in" ||
        pathname.startsWith("/mobile/sign-in/")
      ) {
        clearFieldSurfaceSession();
        setFieldSurface(false);
        setFieldVerificationPending(false);
        setVerifiedFieldPathname(null);
        return;
      }

      const storedSurfaceScope = readFieldSurfaceSession();
      if (!isFieldRoute && !storedSurfaceScope) {
        setFieldSurface(false);
        setFieldVerificationPending(false);
        setVerifiedFieldPathname(null);
        return;
      }

      if (!preserveCurrentFieldSurface) {
        setFieldVerificationPending(true);
      }
      const supabase = createBrowserSupabase();
      const sessionResult = await supabase.auth.getSession();
      if (!active) return;
      const authUserId = sessionResult.data.session?.user.id?.trim() ?? "";
      if (sessionResult.error || !authUserId) {
        clearFieldSurfaceSession();
        setFieldSurface(false);
        setFieldVerificationPending(false);
        setVerifiedFieldPathname(null);
        return;
      }

      const actorSurfaceScope =
        storedSurfaceScope?.userId === authUserId ? storedSurfaceScope : null;
      if (storedSurfaceScope && !actorSurfaceScope) {
        clearFieldSurfaceSession();
      }

      const persistedScope = getOfflineMutationScope();
      if (persistedScope && persistedScope.userId !== authUserId) {
        setOfflineMutationScope(null);
      }
      const offlineScope =
        actorSurfaceScope ??
        (isFieldRoute && persistedScope?.userId === authUserId
          ? persistedScope
          : null);
      const cachedAccess = offlineScope
        ? readFieldServiceOfflineAccess(offlineScope)
        : null;

      try {
        const response = await runBoundedRouteLoad(
          { route: pathname, operation: "verify Field workspace shell" },
          async ({ recordStatus, signal }) => {
            const result = await fetch("/api/mobile/field-service/access", {
              credentials: "include",
              cache: "no-store",
              signal,
            });
            recordStatus(result.status);
            return result;
          },
        );
        const body = (await response
          .json()
          .catch(() => null)) as FieldServiceAccessPayload | null;
        if (!active) return;
        const verifiedScope = resolveFieldServiceAccessScope(body, authUserId);

        if (!response.ok) {
          if (
            response.status >= 500 ||
            isRetryableOfflineStatus(response.status)
          ) {
            throw routeLoadFailureFromStatus(
              response.status,
              "Field workspace access could not be verified.",
            );
          }
          if (verifiedScope) clearFieldServiceOfflineAccess(verifiedScope);
          if (offlineScope && offlineScope.shopId !== verifiedScope?.shopId) {
            clearFieldServiceOfflineAccess(offlineScope);
          }
          clearFieldSurfaceSession();
          setFieldSurface(false);
          setVerifiedFieldPathname(null);
          setFieldVerificationPending(false);
          return;
        }

        if (!verifiedScope) {
          clearFieldSurfaceSession();
          setFieldSurface(false);
          setVerifiedFieldPathname(null);
          setFieldVerificationPending(false);
          return;
        }

        const canAccessFieldService = body?.canAccessFieldService === true;
        const standaloneSetupSurface = Boolean(
          pathname.startsWith("/mobile/service/setup") &&
          body?.standaloneFieldWorkspace &&
          body?.canConfigure,
        );

        if (canAccessFieldService) {
          setOfflineMutationScope(verifiedScope);
          writeFieldServiceOfflineAccess(verifiedScope, body);
          if (body?.standaloneFieldWorkspace === true) {
            writeFieldSurfaceSession(verifiedScope);
          } else {
            clearFieldSurfaceSession();
          }
          const shouldUseFieldSurface =
            isFieldRoute || body?.standaloneFieldWorkspace === true;
          setFieldSurface(shouldUseFieldSurface);
          setVerifiedFieldPathname(shouldUseFieldSurface ? pathname : null);
        } else if (standaloneSetupSurface) {
          clearFieldSurfaceSession();
          setFieldSurface(true);
          setVerifiedFieldPathname(pathname);
        } else {
          clearFieldSurfaceSession();
          clearFieldServiceOfflineAccess(verifiedScope);
          setFieldSurface(false);
          setVerifiedFieldPathname(null);
        }
        setFieldVerificationPending(false);
      } catch {
        if (!active) return;
        const preserveCachedFieldSurface = Boolean(
          cachedAccess && (isFieldRoute || actorSurfaceScope),
        );
        setFieldSurface(preserveCachedFieldSurface);
        setVerifiedFieldPathname(preserveCachedFieldSurface ? pathname : null);
        setFieldVerificationPending(false);
      }
    };

    void verifyFieldSurface().catch(() => {
      if (active) {
        setFieldSurface(false);
        setVerifiedFieldPathname(null);
        setFieldVerificationPending(false);
      }
    });

    return () => {
      active = false;
    };
  }, [fieldVerificationAttempt, pathname]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      const storedScope = readFieldSurfaceSession();
      const nextUserId = session?.user.id?.trim() ?? "";
      if (!nextUserId || (storedScope && storedScope.userId !== nextUserId)) {
        clearFieldSurfaceSession();
        setFieldSurface(false);
        setVerifiedFieldPathname(null);
      }
      preserveFieldSurfaceOnNextVerification.current = false;
      setFieldVerificationAttempt((value) => value + 1);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const revalidate = () => {
      preserveFieldSurfaceOnNextVerification.current = true;
      setFieldVerificationAttempt((value) => value + 1);
    };
    const revalidateWhenVisible = () => {
      if (document.visibilityState === "visible") revalidate();
    };

    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", revalidateWhenVisible);
    return () => {
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", revalidateWhenVisible);
    };
  }, []);

  useEffect(() => {
    const openMenu = () => setMenuOpen(true);
    window.addEventListener("profixiq:mobile-menu-open", openMenu);
    return () =>
      window.removeEventListener("profixiq:mobile-menu-open", openMenu);
  }, []);

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

      event.preventDefault();
      event.stopPropagation();
      if (currentHref !== "/mobile") router.push("/mobile");
    };

    document.addEventListener("click", keepNavigationMobile, true);
    return () =>
      document.removeEventListener("click", keepNavigationMobile, true);
  }, [router]);

  if (
    pathname === "/mobile/sign-in" ||
    pathname.startsWith("/mobile/sign-in/")
  ) {
    return children;
  }

  let mobileSurface: ReactNode;
  if (isImmersiveRoute(pathname)) {
    mobileSurface = (
      <div className="profixiq-mobile-command min-h-screen overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
        <main className="mobile-command-main min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    );
  } else if (
    fieldVerificationPending ||
    (fieldSurface && verifiedFieldPathname !== pathname)
  ) {
    mobileSurface = (
      <div className="profixiq-mobile-command min-h-screen overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
        <main
          aria-busy="true"
          className="mobile-command-main grid min-h-[60vh] place-items-center px-4 text-center text-sm font-semibold text-[color:var(--theme-text-secondary)]"
        >
          Verifying Field workspace...
        </main>
      </div>
    );
  } else if (fieldSurface) {
    mobileSurface = <FieldWorkspaceShell>{children}</FieldWorkspaceShell>;
  } else {
    mobileSurface = (
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

  return (
    <>
      {mobileSurface}
      <TechnicianCopilotShell shouldCheck surface="mobile" />
    </>
  );
}

export default MobileShell;
