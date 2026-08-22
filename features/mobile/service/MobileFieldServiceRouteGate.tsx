"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  resolveFieldExistingSessionHref,
  type FieldExistingSessionAccess,
} from "@/features/auth/lib/accessSurfaceRouting";
import {
  getOfflineMutationScope,
  isRetryableOfflineStatus,
  setOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  clearFieldServiceOfflineAccess,
  readFieldServiceOfflineAccess,
  resolveFieldServiceAccessScope,
  writeFieldServiceOfflineAccess,
  type FieldServiceAccessPayload,
} from "./fieldOfflineAccess";
import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
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
  const [attempt, setAttempt] = useState(0);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailureState | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    setAllowed(false);
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
        const cachedScope = getOfflineMutationScope();
        const operatorScope =
          cachedScope?.userId === authUserId ? cachedScope : null;
        const cachedAccess = operatorScope
          ? readFieldServiceOfflineAccess(operatorScope)
          : null;
        const responseAccess = (await response
          ?.json()
          .catch(() => null)) as FieldServiceAccessPayload | null;
        if (!active) return;

        if (!authUserId) {
          router.replace("/mobile");
          return;
        }

        let access: FieldExistingSessionAccess | null = null;
        if (response?.ok && responseAccess) {
          const verifiedScope = resolveFieldServiceAccessScope(
            responseAccess,
            authUserId,
          );
          if (verifiedScope) {
            access = responseAccess;
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
          cachedAccess
        ) {
          access = cachedAccess;
        } else if (!response) {
          throw new RouteLoadFailure({
            kind: "network",
            message: "Field Service access could not be verified.",
          });
        } else if (!response.ok) {
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
          setAllowed(true);
          return;
        }

        router.replace(destination ?? "/mobile");
      },
    ).catch((error) => {
      if (active) {
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
  }, [attempt, pathname, router]);

  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
        {loadFailure ? (
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

  return children;
}
