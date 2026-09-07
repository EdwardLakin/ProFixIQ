"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkspaceCapabilityEffect,
  WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";
import type { PermissionSnapshot } from "./permissionModel";

type SnapshotResponse = { snapshot?: PermissionSnapshot; error?: string };

export type PermissionAdministrationState = {
  snapshot: PermissionSnapshot | null;
  loading: boolean;
  /** Non-null when the caller is not allowed to administer permissions. */
  forbidden: boolean;
  error: string | null;
  notice: string | null;
  pendingCapability: WorkspaceCapabilityKey | null;
  reload: () => Promise<void>;
  clearMessages: () => void;
  setRolePolicy: (
    roleKey: string,
    capabilityKey: WorkspaceCapabilityKey,
    effect: WorkspaceCapabilityEffect,
  ) => Promise<void>;
  setStaffOverride: (
    capabilityKey: WorkspaceCapabilityKey,
    effect: WorkspaceCapabilityEffect,
  ) => Promise<void>;
};

const EFFECT_NOTICE: Record<WorkspaceCapabilityEffect, string> = {
  inherit: "Restored the inherited setting.",
  allow: "Access allowed.",
  deny: "Access denied.",
};

export function usePermissionAdministration(
  targetProfileId?: string | null,
): PermissionAdministrationState {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCapability, setPendingCapability] =
    useState<WorkspaceCapabilityKey | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const query = targetProfileId
        ? `?profileId=${encodeURIComponent(targetProfileId)}`
        : "";
      const response = await fetch(
        `/api/workspace/authorization/administration${query}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | SnapshotResponse
        | null;
      if (requestId !== requestRef.current) return;

      if (response.status === 403) {
        setForbidden(true);
        setSnapshot(null);
        return;
      }
      if (!response.ok || !payload?.snapshot) {
        setForbidden(false);
        setSnapshot(null);
        setError(payload?.error ?? "Permissions could not be loaded.");
        return;
      }
      setForbidden(false);
      setError(null);
      setSnapshot(payload.snapshot);
    } catch {
      if (requestId !== requestRef.current) return;
      setSnapshot(null);
      setError("Permissions could not be loaded.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [targetProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (
      endpoint: string,
      body: Record<string, unknown>,
      capabilityKey: WorkspaceCapabilityKey,
      effect: WorkspaceCapabilityEffect,
    ) => {
      setPendingCapability(capabilityKey);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok) {
          setError(payload?.error ?? "That permission change was not allowed.");
          return;
        }
        setNotice(EFFECT_NOTICE[effect]);
        // Always re-read the authoritative decision rather than assuming the
        // requested effect became the effective result.
        await load();
      } catch {
        setError("That permission change could not be saved.");
      } finally {
        setPendingCapability(null);
      }
    },
    [load],
  );

  const setRolePolicy = useCallback(
    async (
      roleKey: string,
      capabilityKey: WorkspaceCapabilityKey,
      effect: WorkspaceCapabilityEffect,
    ) => {
      await submit(
        "/api/workspace/authorization/role-policies",
        { roleKey, capabilityKey, effect },
        capabilityKey,
        effect,
      );
    },
    [submit],
  );

  const setStaffOverride = useCallback(
    async (
      capabilityKey: WorkspaceCapabilityKey,
      effect: WorkspaceCapabilityEffect,
    ) => {
      if (!targetProfileId) return;
      await submit(
        "/api/workspace/authorization/staff-overrides",
        { targetProfileId, capabilityKey, effect },
        capabilityKey,
        effect,
      );
    },
    [submit, targetProfileId],
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    snapshot,
    loading,
    forbidden,
    error,
    notice,
    pendingCapability,
    reload: load,
    clearMessages,
    setRolePolicy,
    setStaffOverride,
  };
}
