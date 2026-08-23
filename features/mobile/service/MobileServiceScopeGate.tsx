"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getOfflineMutationScope,
  isRetryableOfflineStatus,
  setOfflineMutationScope,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import FieldHub from "./FieldHub";
import FieldServiceAccessPanel from "./FieldServiceAccessPanel";
import {
  isFieldServiceAccessDecision,
  type FieldServiceAccessDecision,
} from "./fieldServiceAccessContract";
import {
  EMPTY_FIELD_WORKSPACE_CAPABILITIES,
  normalizeFieldWorkspaceCapabilities,
  type FieldWorkspaceCapabilities,
} from "./fieldWorkspaceCapabilities";
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

const SNAPSHOT_CACHE_KEY = "profixiq:mobile-service:active:v1";
const SNAPSHOT_SCOPE_KEY = "profixiq:mobile-service:active-scope:v1";

type StoredScope = Pick<OfflineMutationScope, "userId" | "shopId">;

function sameScope(
  left: StoredScope | null,
  right: StoredScope | null,
): boolean {
  return Boolean(
    left &&
    right &&
    left.userId === right.userId &&
    left.shopId === right.shopId,
  );
}

function readStoredScope(): StoredScope | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SNAPSHOT_SCOPE_KEY) ?? "null",
    ) as Partial<StoredScope> | null;
    const userId = String(parsed?.userId ?? "").trim();
    const shopId = String(parsed?.shopId ?? "").trim();
    return userId && shopId ? { userId, shopId } : null;
  } catch {
    return null;
  }
}

function protectSnapshot(scope: OfflineMutationScope | null): void {
  try {
    const storedScope = readStoredScope();
    if (!scope || !sameScope(storedScope, scope)) {
      window.localStorage.removeItem(SNAPSHOT_CACHE_KEY);
    }

    if (scope) {
      window.localStorage.setItem(
        SNAPSHOT_SCOPE_KEY,
        JSON.stringify({ userId: scope.userId, shopId: scope.shopId }),
      );
    } else {
      window.localStorage.removeItem(SNAPSHOT_SCOPE_KEY);
    }
  } catch {
    // Snapshot persistence is best-effort; verified online access remains usable.
  }
}

export default function MobileServiceScopeGate() {
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState<OfflineMutationScope | null>(null);
  const [workspaceCapabilities, setWorkspaceCapabilities] =
    useState<FieldWorkspaceCapabilities>(EMPTY_FIELD_WORKSPACE_CAPABILITIES);
  const [attempt, setAttempt] = useState(0);
  const [blockedDecision, setBlockedDecision] = useState<Extract<
    FieldServiceAccessDecision,
    "plan_required" | "forbidden"
  > | null>(null);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailureState | null>(
    null,
  );
  const router = useRouter();

  useEffect(() => {
    let active = true;
    setReady(false);
    setBlockedDecision(null);
    setLoadFailure(null);

    void runBoundedRouteLoad(
      { route: "/mobile/service", operation: "load field service scope" },
      async ({ recordStatus, signal }) => {
        const supabase = createBrowserSupabase();
        const [sessionResult, fieldAccessResponse] = await Promise.all([
          supabase.auth.getSession(),
          fetch("/api/mobile/field-service/access", {
            credentials: "include",
            cache: "no-store",
            signal,
          }).catch(() => null),
        ]);
        if (fieldAccessResponse) recordStatus(fieldAccessResponse.status);
        const session = sessionResult.data.session;
        const authUserId = session?.user?.id?.trim() ?? "";

        if (!authUserId) {
          if (!active) return;
          protectSnapshot(null);
          router.replace("/mobile");
          return;
        }

        const fieldAccess = (await fieldAccessResponse
          ?.json()
          .catch(() => null)) as FieldServiceAccessPayload | null;
        if (!active) return;

        const cached = getOfflineMutationScope();
        const cachedScope = cached?.userId === authUserId ? cached : null;

        const verifiedResponseScope = fieldAccess
          ? resolveFieldServiceAccessScope(fieldAccess, authUserId)
          : null;
        const responseDecision = isFieldServiceAccessDecision(
          fieldAccess?.decision,
        )
          ? fieldAccess.decision
          : null;

        if (
          fieldAccessResponse?.status === 403 &&
          verifiedResponseScope &&
          (responseDecision === "plan_required" ||
            responseDecision === "forbidden")
        ) {
          clearFieldServiceOfflineAccess(verifiedResponseScope);
          if (
            cachedScope &&
            cachedScope.shopId !== verifiedResponseScope.shopId
          ) {
            clearFieldServiceOfflineAccess(cachedScope);
          }
          protectSnapshot(null);
          setBlockedDecision(responseDecision);
          return;
        }

        if (fieldAccessResponse?.ok && fieldAccess?.canAccessFieldService) {
          const verifiedScope = resolveFieldServiceAccessScope(
            fieldAccess,
            authUserId,
          );
          if (!verifiedScope) {
            if (cachedScope) clearFieldServiceOfflineAccess(cachedScope);
            protectSnapshot(null);
            router.replace("/mobile");
            return;
          }

          setOfflineMutationScope(verifiedScope);
          writeFieldServiceOfflineAccess(verifiedScope, fieldAccess);
          setWorkspaceCapabilities(
            normalizeFieldWorkspaceCapabilities(
              fieldAccess.workspaceCapabilities,
            ),
          );
          setScope(verifiedScope);
          protectSnapshot(verifiedScope);
          setReady(true);
          return;
        }

        const verificationUnavailable =
          !fieldAccessResponse ||
          fieldAccessResponse.status >= 500 ||
          isRetryableOfflineStatus(fieldAccessResponse.status);
        const offlineAccess =
          verificationUnavailable && cachedScope
            ? readFieldServiceOfflineAccess(cachedScope)
            : null;
        if (offlineAccess) {
          setWorkspaceCapabilities(offlineAccess.workspaceCapabilities);
          setScope(cachedScope);
          protectSnapshot(cachedScope);
          setReady(true);
          return;
        }

        if (!fieldAccessResponse) {
          throw new RouteLoadFailure({
            kind: "network",
            message: "Field Service access could not be verified.",
          });
        }

        if (!fieldAccessResponse.ok) {
          throw routeLoadFailureFromStatus(
            fieldAccessResponse.status,
            fieldAccessResponse.status === 403
              ? "Your account does not have access to Field Service."
              : "Field Service access could not be verified.",
          );
        }

        if (cachedScope && !verificationUnavailable) {
          clearFieldServiceOfflineAccess(cachedScope);
        }
        if (!fieldAccessResponse?.ok || !fieldAccess?.canAccessFieldService) {
          protectSnapshot(null);
          router.replace(
            fieldAccess?.canConfigure ? "/mobile/service/setup" : "/mobile",
          );
          return;
        }
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
  }, [attempt, router]);

  if (!ready) {
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

  if (!scope) return null;

  return (
    <FieldHub
      key={`${scope.shopId}:${scope.userId}`}
      capabilities={workspaceCapabilities}
      scope={scope}
    />
  );
}
