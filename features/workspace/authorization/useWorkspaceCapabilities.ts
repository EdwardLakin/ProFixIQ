"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createDeniedWorkspaceCapabilities,
  type EffectiveWorkspaceCapabilities,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";

type CapabilityResponse = {
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
        if (!response.ok || !payload?.capabilities) {
          setCapabilities(createDeniedWorkspaceCapabilities());
          return;
        }

        const next = createDeniedWorkspaceCapabilities();
        for (const capabilityKey of Object.keys(next) as WorkspaceCapabilityKey[]) {
          const decision = payload.capabilities[capabilityKey];
          if (!decision) continue;
          next[capabilityKey] = {
            ...next[capabilityKey],
            granted: Boolean(decision.granted),
            source:
              decision.source === "individual_override" ||
              decision.source === "shop_role_policy" ||
              decision.source === "profixiq_preset"
                ? decision.source
                : "unavailable",
          };
        }
        setCapabilities(next);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCapabilities(createDeniedWorkspaceCapabilities());
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
