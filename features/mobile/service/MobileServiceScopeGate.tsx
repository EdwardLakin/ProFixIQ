"use client";

import { useEffect, useState } from "react";

import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import {
  getOfflineMutationScope,
  setOfflineMutationScope,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import MobileServiceShell from "./MobileServiceShell";

const SNAPSHOT_CACHE_KEY = "profixiq:mobile-service:active:v1";
const SNAPSHOT_SCOPE_KEY = "profixiq:mobile-service:active-scope:v1";

type StoredScope = Pick<OfflineMutationScope, "userId" | "shopId">;

function sameScope(left: StoredScope | null, right: StoredScope | null): boolean {
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
}

export default function MobileServiceScopeGate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const supabase = createBrowserSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUserId = session?.user?.id?.trim() ?? "";

      if (!authUserId) {
        if (!active) return;
        protectSnapshot(null);
        setReady(true);
        return;
      }

      const cached = getOfflineMutationScope();
      let scope: OfflineMutationScope | null =
        cached?.userId === authUserId ? cached : null;

      if (!scope && typeof navigator !== "undefined" && navigator.onLine) {
        const actor = await resolveCurrentActor(supabase);
        if (actor.user?.id === authUserId && actor.shopId) {
          scope = { userId: authUserId, shopId: actor.shopId };
          setOfflineMutationScope(scope);
        }
      }

      if (!active) return;
      protectSnapshot(scope);
      setReady(true);
    })().catch(() => {
      if (!active) return;
      // If identity cannot be established, fail closed: do not render another
      // actor's cached service-call snapshot.
      window.localStorage.removeItem(SNAPSHOT_CACHE_KEY);
      window.localStorage.removeItem(SNAPSHOT_SCOPE_KEY);
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
        <div className="h-32 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
      </main>
    );
  }

  return <MobileServiceShell />;
}
