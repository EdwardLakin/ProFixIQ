"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const verificationEpochRef = useRef(0);
  const scopeRef = useRef<OfflineMutationScope | null>(null);

  const clearVerifiedWorkspace = useCallback(() => {
    scopeRef.current = null;
    setReady(false);
    setScope(null);
    setWorkspaceCapabilities(EMPTY_FIELD_WORKSPACE_CAPABILITIES);
  }, []);

  const acceptVerifiedWorkspace = useCallback(
    (
      verifiedScope: OfflineMutationScope,
      capabilities: FieldWorkspaceCapabilities,
    ) => {
      scopeRef.current = verifiedScope;
      setWorkspaceCapabilities(capabilities);
      setScope(verifiedScope);
      setReady(true);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const previousVerifiedScope = scopeRef.current;
    let preserveVerifiedOnFailure = Boolean(previousVerifiedScope);
    const verificationEpoch = ++verificationEpochRef.current;
    const isCurrent = () =>
      active && verificationEpoch === verificationEpochRef.current;
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
        preserveVerifiedOnFailure =
          previousVerifiedScope?.userId === authUserId;

        if (!isCurrent()) return;
        if (!authUserId) {
          clearVerifiedWorkspace();
          protectSnapshot(null);
          router.replace("/mobile");
          return;
        }

        if (
          previousVerifiedScope &&
          previousVerifiedScope.userId !== authUserId
        ) {
          setOfflineMutationScope(null);
          protectSnapshot(null);
          clearVerifiedWorkspace();
          setAttempt((value) => value + 1);
          return;
        }

        const persistedScope = getOfflineMutationScope();
        if (persistedScope && persistedScope.userId !== authUserId) {
          setOfflineMutationScope(null);
          protectSnapshot(null);
        }

        const fieldAccess = (await fieldAccessResponse
          ?.json()
          .catch(() => null)) as FieldServiceAccessPayload | null;
        if (!isCurrent()) return;

        const cachedScope =
          persistedScope?.userId === authUserId ? persistedScope : null;

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
          clearVerifiedWorkspace();
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
            clearVerifiedWorkspace();
            protectSnapshot(null);
            router.replace("/mobile");
            return;
          }

          setOfflineMutationScope(verifiedScope);
          writeFieldServiceOfflineAccess(verifiedScope, fieldAccess);
          acceptVerifiedWorkspace(
            verifiedScope,
            normalizeFieldWorkspaceCapabilities(
              fieldAccess.workspaceCapabilities,
            ),
          );
          protectSnapshot(verifiedScope);
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
        if (verificationUnavailable && preserveVerifiedOnFailure) {
          return;
        }

        if (offlineAccess && cachedScope) {
          acceptVerifiedWorkspace(
            cachedScope,
            offlineAccess.workspaceCapabilities,
          );
          protectSnapshot(cachedScope);
          return;
        }

        if (!fieldAccessResponse) {
          throw new RouteLoadFailure({
            kind: "network",
            message: "Field Service access could not be verified.",
          });
        }

        if (!fieldAccessResponse.ok) {
          clearVerifiedWorkspace();
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
          clearVerifiedWorkspace();
          protectSnapshot(null);
          router.replace(
            fieldAccess?.canConfigure ? "/mobile/service/setup" : "/mobile",
          );
          return;
        }
      },
    ).catch((error) => {
      if (isCurrent()) {
        if (
          preserveVerifiedOnFailure &&
          previousVerifiedScope &&
          scopeRef.current?.userId === previousVerifiedScope.userId
        ) {
          return;
        }
        clearVerifiedWorkspace();
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
    acceptVerifiedWorkspace,
    attempt,
    clearVerifiedWorkspace,
    router,
  ]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      const currentUserId = scopeRef.current?.userId ?? "";
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
        protectSnapshot(null);
        clearVerifiedWorkspace();
      }
      setBlockedDecision(null);
      setLoadFailure(null);
      setAttempt((value) => value + 1);
    });

    return () => data.subscription.unsubscribe();
  }, [clearVerifiedWorkspace]);

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
      key={scope.shopId}
      capabilities={workspaceCapabilities}
      scope={scope}
    />
  );
}
