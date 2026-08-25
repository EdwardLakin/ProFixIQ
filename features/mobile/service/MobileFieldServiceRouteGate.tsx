"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  resolveFieldExistingSessionHref,
  type FieldExistingSessionAccess,
} from "@/features/auth/lib/accessSurfaceRouting";
import {
  getOfflineMutationScope,
  isRetryableOfflineStatus,
  setOfflineMutationScope,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import FieldServiceAccessPanel from "./FieldServiceAccessPanel";
import {
  isFieldServiceAccessDecision,
  type FieldServiceAccessDecision,
} from "./fieldServiceAccessContract";
import {
  clearFieldServiceOfflineAccess,
  readFieldServiceOfflineAccess,
  resolveFieldServiceAccessScope,
  writeFieldServiceOfflineAccess,
  type FieldServiceAccessPayload,
} from "./fieldOfflineAccess";
import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
import { FieldServiceVerifiedScopeProvider } from "./FieldServiceVerifiedScope";
import {
  asRouteLoadFailure,
  RouteLoadFailure,
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
  type RouteLoadFailure as RouteLoadFailureState,
} from "@/features/shared/lib/route-load";

export default function MobileFieldServiceRouteGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [verifiedScope, setVerifiedScope] =
    useState<OfflineMutationScope | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [blockedDecision, setBlockedDecision] = useState<Extract<
    FieldServiceAccessDecision,
    "plan_required" | "forbidden"
  > | null>(null);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailureState | null>(
    null,
  );
  const verificationEpochRef = useRef(0);
  const verifiedScopeRef = useRef<OfflineMutationScope | null>(null);
  const verifiedPathnameRef = useRef<string | null>(null);

  const clearVerifiedAccess = useCallback(() => {
    verifiedScopeRef.current = null;
    verifiedPathnameRef.current = null;
    setAllowed(false);
    setVerifiedScope(null);
  }, []);

  const acceptVerifiedAccess = useCallback(
    (scope: OfflineMutationScope) => {
      verifiedScopeRef.current = scope;
      verifiedPathnameRef.current = pathname;
      setVerifiedScope(scope);
      setAllowed(true);
    },
    [pathname],
  );

  useEffect(() => {
    let active = true;
    const previousVerifiedScope = verifiedScopeRef.current;
    const previousPathname = verifiedPathnameRef.current;
    let preserveVerifiedOnFailure = Boolean(
      previousVerifiedScope && previousPathname === pathname,
    );
    const verificationEpoch = ++verificationEpochRef.current;
    const isCurrent = () =>
      active && verificationEpoch === verificationEpochRef.current;
    setBlockedDecision(null);
    setLoadFailure(null);

    void runBoundedRouteLoad(
      { route: pathname, operation: "verify field service route access" },
      async ({ recordStatus, signal }) => {
        const supabase = createBrowserSupabase();
        const [sessionResult, response] = await Promise.all([
          supabase.auth.getSession(),
          fetch("/api/mobile/field-service/access", {
            credentials: "include",
            cache: "no-store",
            signal,
          }).catch(() => null),
        ]);
        if (response) recordStatus(response.status);
        const authUserId = sessionResult.data.session?.user.id?.trim() ?? "";
        preserveVerifiedOnFailure = Boolean(
          previousVerifiedScope?.userId === authUserId &&
            previousPathname === pathname,
        );
        if (!isCurrent()) return;

        if (!authUserId) {
          clearVerifiedAccess();
          router.replace("/mobile");
          return;
        }

        if (
          previousVerifiedScope &&
          previousVerifiedScope.userId !== authUserId
        ) {
          setOfflineMutationScope(null);
          clearVerifiedAccess();
          setAttempt((value) => value + 1);
          return;
        }

        const persistedScope = getOfflineMutationScope();
        if (persistedScope && persistedScope.userId !== authUserId) {
          setOfflineMutationScope(null);
        }
        const cachedScope =
          persistedScope?.userId === authUserId ? persistedScope : null;
        const operatorScope =
          cachedScope?.userId === authUserId ? cachedScope : null;
        const cachedAccess = operatorScope
          ? readFieldServiceOfflineAccess(operatorScope)
          : null;
        const responseAccess = (await response
          ?.json()
          .catch(() => null)) as FieldServiceAccessPayload | null;
        if (!isCurrent()) return;

        let access: FieldExistingSessionAccess | null = null;
        let accessScope: OfflineMutationScope | null = null;
        const verifiedResponseScope = responseAccess
          ? resolveFieldServiceAccessScope(responseAccess, authUserId)
          : null;
        const responseDecision = isFieldServiceAccessDecision(
          responseAccess?.decision,
        )
          ? responseAccess.decision
          : null;

        if (
          response?.status === 403 &&
          verifiedResponseScope &&
          (responseDecision === "plan_required" ||
            responseDecision === "forbidden")
        ) {
          clearFieldServiceOfflineAccess(verifiedResponseScope);
          if (
            operatorScope &&
            operatorScope.shopId !== verifiedResponseScope.shopId
          ) {
            clearFieldServiceOfflineAccess(operatorScope);
          }
          if (
            responseDecision === "forbidden" &&
            responseAccess?.productEntitled === true
          ) {
            const destination = resolveFieldExistingSessionHref(
              responseAccess,
              pathname,
            );
            if (destination === pathname) {
              acceptVerifiedAccess(verifiedResponseScope);
              return;
            }
            if (destination) {
              clearVerifiedAccess();
              router.replace(destination);
              return;
            }
          }
          clearVerifiedAccess();
          setBlockedDecision(responseDecision);
          return;
        }

        if (response?.ok && responseAccess) {
          const verifiedScope = verifiedResponseScope;
          if (verifiedScope) {
            access = responseAccess;
            accessScope = verifiedScope;
          }
          if (verifiedScope && responseAccess.canAccessFieldService === true) {
            setOfflineMutationScope(verifiedScope);
            writeFieldServiceOfflineAccess(verifiedScope, responseAccess);
          } else if (verifiedScope) {
            clearFieldServiceOfflineAccess(verifiedScope);
          } else if (operatorScope) {
            clearFieldServiceOfflineAccess(operatorScope);
          }
        } else if (
          (!response ||
            response.status >= 500 ||
            isRetryableOfflineStatus(response.status)) &&
          preserveVerifiedOnFailure
        ) {
          return;
        } else if (
          (!response ||
            response.status >= 500 ||
            isRetryableOfflineStatus(response.status)) &&
          cachedAccess
        ) {
          access = cachedAccess;
          accessScope = operatorScope;
        } else if (!response) {
          throw new RouteLoadFailure({
            kind: "network",
            message: "Field Service access could not be verified.",
          });
        } else if (!response.ok) {
          clearVerifiedAccess();
          throw routeLoadFailureFromStatus(
            response.status,
            response.status === 403
              ? "Your account does not have access to Field Service."
              : "Field Service access could not be verified.",
          );
        } else if (operatorScope) {
          clearFieldServiceOfflineAccess(operatorScope);
        }

        const destination = access
          ? resolveFieldExistingSessionHref(access, pathname)
          : null;

        if (destination === pathname) {
          if (!accessScope) {
            clearVerifiedAccess();
            router.replace("/mobile");
            return;
          }
          acceptVerifiedAccess(accessScope);
          return;
        }

        if (
          access?.decision === "ready" &&
          pathname === "/mobile/service/setup" &&
          access.canConfigure !== true
        ) {
          clearVerifiedAccess();
          setBlockedDecision("forbidden");
          return;
        }

        clearVerifiedAccess();
        router.replace(destination ?? "/mobile");
      },
    ).catch((error) => {
      if (isCurrent()) {
        if (
          preserveVerifiedOnFailure &&
          previousVerifiedScope &&
          verifiedScopeRef.current?.userId === previousVerifiedScope.userId
        ) {
          return;
        }
        clearVerifiedAccess();
        setLoadFailure(
          asRouteLoadFailure(
            error,
            "Field Service access could not be verified.",
          ),
        );
      }
    });

    return () => {
      active = false;
    };
  }, [
    acceptVerifiedAccess,
    attempt,
    clearVerifiedAccess,
    pathname,
    router,
  ]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      const currentUserId = verifiedScopeRef.current?.userId ?? "";
      const persistedUserId = getOfflineMutationScope()?.userId ?? "";
      const nextUserId = session?.user.id?.trim() ?? "";
      const failClosed =
        event === "SIGNED_OUT" ||
        !nextUserId ||
        Boolean(currentUserId && currentUserId !== nextUserId) ||
        Boolean(persistedUserId && persistedUserId !== nextUserId);
      if (event === "INITIAL_SESSION" && !failClosed) return;

      verificationEpochRef.current += 1;
      if (failClosed) {
        setOfflineMutationScope(null);
        clearVerifiedAccess();
      }
      setBlockedDecision(null);
      setLoadFailure(null);
      setAttempt((value) => value + 1);
    });

    return () => data.subscription.unsubscribe();
  }, [clearVerifiedAccess]);

  useEffect(() => {
    const revalidate = () => setAttempt((value) => value + 1);
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

  if (!allowed || verifiedPathnameRef.current !== pathname) {
    return (
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
        {blockedDecision ? (
          <FieldServiceAccessPanel
            decision={blockedDecision}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        ) : loadFailure ? (
          <RouteLoadPanel
            failure={loadFailure}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        ) : (
          <div className="h-32 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
        )}
      </main>
    );
  }

  if (!verifiedScope) return null;

  return (
    <FieldServiceVerifiedScopeProvider
      key={verifiedScope.shopId}
      scope={verifiedScope}
    >
      {children}
    </FieldServiceVerifiedScopeProvider>
  );
}
