"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createDeniedWorkspaceCapabilities,
  type EffectiveWorkspaceCapabilities,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  clearWorkspaceAuthorizationSnapshot,
  normalizeWorkspaceCapabilities,
  persistWorkspaceAuthorizationSnapshot,
  readWorkspaceAuthorizationSnapshot,
  type WorkspaceAuthorizationActor,
} from "@/features/workspace/authorization/offlineWorkspaceAuthorization";

type CapabilityResponse = {
  actor?: WorkspaceAuthorizationActor;
  capabilities?: Partial<
    Record<WorkspaceCapabilityKey, { granted?: boolean; source?: string }>
  >;
};

export function useWorkspaceCapabilities(): {
  capabilities: EffectiveWorkspaceCapabilities;
  can: (capability: WorkspaceCapabilityKey) => boolean;
  loading: boolean;
} {
  const [capabilities, setCapabilities] = useState<EffectiveWorkspaceCapabilities>(
    createDeniedWorkspaceCapabilities,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch("/api/workspace/authorization/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | CapabilityResponse
          | null;
        if (!response.ok || !payload?.capabilities || !payload.actor) {
          if (response.status === 401 || response.status === 403) {
            clearWorkspaceAuthorizationSnapshot();
          }
          setCapabilities(createDeniedWorkspaceCapabilities());
          return;
        }

        const next = normalizeWorkspaceCapabilities(payload.capabilities);
        persistWorkspaceAuthorizationSnapshot({
          actor: payload.actor,
          capabilities: next,
        });
        setCapabilities(next);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const {
            data: { session },
          } = await createBrowserSupabase().auth.getSession();
          const snapshot = session?.user.id
            ? readWorkspaceAuthorizationSnapshot({ userId: session.user.id })
            : null;
          setCapabilities(
            snapshot?.capabilities ?? createDeniedWorkspaceCapabilities(),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  const can = useCallback(
    (capability: WorkspaceCapabilityKey) => capabilities[capability].granted,
    [capabilities],
  );

  return { capabilities, can, loading };
}
