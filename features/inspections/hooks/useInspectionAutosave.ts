"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  saveInspectionOfflineDraft,
  type InspectionDraftRecoveryState,
} from "@inspections/lib/inspection/offlineDrafts";

export type InspectionSyncState =
  | "hydrating"
  | "idle"
  | "saving"
  | "saved"
  | "queued"
  | "conflicted"
  | "error";

export type InspectionRemoteMeta = {
  locked: boolean;
  finalizedAt: string | null;
  updatedAt: string | null;
};

type UseInspectionAutosaveArgs = {
  session: InspectionSession | null;
  inspectionId?: string | null;
  workOrderLineId?: string | null;
  enabled?: boolean;
  locked?: boolean;
  draftKey?: string;
  debounceMs?: number;
  recoveryOperationKey?: string;
  onRemoteSession: (session: InspectionSession) => void;
  onRemoteMeta?: (meta: InspectionRemoteMeta) => void;
  onRecoveryState?: (
    state: InspectionDraftRecoveryState,
    operationKey?: string,
  ) => void;
};

type LoadResponse = {
  session?: InspectionSession | null;
  inspectionMeta?: {
    locked?: boolean | null;
    finalizedAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

type RealtimeInspectionRow = {
  summary?: unknown;
  locked?: boolean | null;
  finalized_at?: string | null;
  updated_at?: string | null;
  work_order_line_id?: string | null;
};

type PersistResult = {
  session: InspectionSession;
  durable: boolean;
  queued: boolean;
  conflicted: boolean;
};

function timestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function revision(session: InspectionSession | null): number {
  const value = session?.syncRevision;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function fingerprint(session: InspectionSession | null): string {
  if (!session) return "";
  return [
    session.id ?? "",
    revision(session),
    session.lastUpdated ?? "",
  ].join(":");
}

function hasDurableSession(value: unknown): value is InspectionSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InspectionSession>;
  return Array.isArray(candidate.sections) && candidate.sections.length > 0;
}

function sessionMatchesWorkOrderLine(
  session: InspectionSession | null,
  workOrderLineId?: string | null,
): boolean {
  const embeddedLineId = session?.workOrderLineId?.trim() ?? "";
  const activeLineId = workOrderLineId?.trim() ?? "";
  return !embeddedLineId || !activeLineId || embeddedLineId === activeLineId;
}

function hasMeaningfulLocalChanges(session: InspectionSession): boolean {
  if (session.transcript?.trim()) return true;
  if ((session.quote?.length ?? 0) > 0) return true;

  return (session.sections ?? []).some((section) =>
    (section.items ?? []).some((item) => {
      const value = item as unknown as {
        status?: unknown;
        notes?: unknown;
        value?: unknown;
        photoUrls?: unknown;
      };
      const status = String(value.status ?? "").trim().toLowerCase();
      const hasStatus =
        status.length > 0 &&
        !["pending", "not_started", "not started"].includes(status);
      const hasNotes =
        typeof value.notes === "string" && value.notes.trim().length > 0;
      const hasValue =
        value.value !== null &&
        value.value !== undefined &&
        String(value.value).trim().length > 0;
      const hasPhotos =
        Array.isArray(value.photoUrls) && value.photoUrls.length > 0;
      return hasStatus || hasNotes || hasValue || hasPhotos;
    }),
  );
}

function remoteShouldReplace(
  remote: InspectionSession,
  local: InspectionSession | null,
  lastPersistedFingerprint: string,
): boolean {
  if (!local) return true;

  const remoteRevision = revision(remote);
  const localRevision = revision(local);
  const localFingerprint = fingerprint(local);
  const localIsDirty = lastPersistedFingerprint
    ? Boolean(localFingerprint) &&
      localFingerprint !== lastPersistedFingerprint
    : hasMeaningfulLocalChanges(local);

  // Never erase an unsaved edit (including a field the user intentionally
  // cleared). The following save will surface a revision conflict if another
  // device advanced while this client was dirty.
  if (localIsDirty) return false;
  if (remoteRevision > localRevision) return true;
  if (remoteRevision < localRevision) return false;
  return timestamp(remote.lastUpdated) >= timestamp(local.lastUpdated);
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { status?: unknown }).status;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function inspectionSyncLabel(
  state: InspectionSyncState,
  locked = false,
): string {
  if (locked) return "Signed and locked · synced on all devices";
  if (state === "hydrating") return "Checking saved inspection…";
  if (state === "saving") return "Saving to all devices…";
  if (state === "saved") return "Saved to shop • syncs across devices";
  if (state === "queued") return "Saved on this device · sync queued";
  if (state === "conflicted") return "Newer server changes need review";
  if (state === "error") return "Autosave needs attention";
  return "Autosave ready";
}

export function useInspectionAutosave({
  session,
  inspectionId,
  workOrderLineId,
  enabled = true,
  locked = false,
  draftKey,
  debounceMs = 700,
  recoveryOperationKey,
  onRemoteSession,
  onRemoteMeta,
  onRecoveryState,
}: UseInspectionAutosaveArgs) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const identityKey =
    workOrderLineId?.trim() || inspectionId?.trim() || "";
  const [state, setState] = useState<InspectionSyncState>("hydrating");
  const [hydrated, setHydrated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const latestSessionRef = useRef<InspectionSession | null>(session);
  const identityRef = useRef(identityKey);
  const lastServerFingerprintRef = useRef("");
  const lastServerRevisionRef = useRef(0);
  const lastServerUpdatedAtRef = useRef(0);
  const lastQueuedFingerprintRef = useRef("");
  const lastRemoteMetaAtRef = useRef(0);
  const pendingOperationKeyRef = useRef<string | undefined>(undefined);
  const pendingOperationFingerprintRef = useRef("");
  const saveQueueRef = useRef<Promise<InspectionSession | null>>(
    Promise.resolve(null),
  );
  const hydrationPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const onRemoteSessionRef = useRef(onRemoteSession);
  const onRemoteMetaRef = useRef(onRemoteMeta);
  const onRecoveryStateRef = useRef(onRecoveryState);

  onRemoteSessionRef.current = onRemoteSession;
  onRemoteMetaRef.current = onRemoteMeta;
  onRecoveryStateRef.current = onRecoveryState;

  if (identityRef.current !== identityKey) {
    identityRef.current = identityKey;
    lastServerFingerprintRef.current = "";
    lastServerRevisionRef.current = 0;
    lastServerUpdatedAtRef.current = 0;
    lastQueuedFingerprintRef.current = "";
    lastRemoteMetaAtRef.current = 0;
    pendingOperationKeyRef.current = undefined;
    pendingOperationFingerprintRef.current = "";
    saveQueueRef.current = Promise.resolve(null);
    hydrationPromiseRef.current = Promise.resolve();
  }
  latestSessionRef.current = session;

  useEffect(() => {
    setLastError(null);
    setState("hydrating");
    setHydrated(false);
  }, [identityKey]);

  useEffect(() => {
    const recoveredKey = recoveryOperationKey?.trim();
    if (recoveredKey && !pendingOperationKeyRef.current) {
      pendingOperationKeyRef.current = recoveredKey;
      pendingOperationFingerprintRef.current = fingerprint(
        latestSessionRef.current,
      );
    }
  }, [recoveryOperationKey]);

  const applyRemoteMeta = useCallback(
    (meta: Partial<InspectionRemoteMeta>): boolean => {
      if (identityRef.current !== identityKey) return false;

      const nextUpdatedAt = timestamp(meta.updatedAt);
      if (
        (nextUpdatedAt === 0 && lastRemoteMetaAtRef.current > 0) ||
        (nextUpdatedAt > 0 &&
          nextUpdatedAt < lastRemoteMetaAtRef.current)
      ) {
        return false;
      }
      if (nextUpdatedAt > 0) {
        lastRemoteMetaAtRef.current = nextUpdatedAt;
      }
      onRemoteMetaRef.current?.({
        locked: Boolean(meta.locked),
        finalizedAt: meta.finalizedAt ?? null,
        updatedAt: meta.updatedAt ?? null,
      });
      return true;
    },
    [identityKey],
  );

  const applyRemote = useCallback(
    (
      remote: InspectionSession,
      meta?: Partial<InspectionRemoteMeta> | null,
      force = false,
    ) => {
      if (identityRef.current !== identityKey) return false;

      const previousServerFingerprint =
        lastServerFingerprintRef.current;
      // Route/query identity can change one render before the owning screen has
      // restored the matching draft. Never let that previous line's session
      // arbitrate against the canonical session for the new line.
      const current = sessionMatchesWorkOrderLine(
        latestSessionRef.current,
        workOrderLineId,
      )
        ? latestSessionRef.current
        : null;
      const metaAccepted = meta ? applyRemoteMeta(meta) : true;
      const remoteFingerprint = fingerprint(remote);
      const remoteRevision = revision(remote);
      const remoteUpdatedAt = timestamp(
        remote.serverUpdatedAt ?? meta?.updatedAt ?? remote.lastUpdated,
      );
      const shouldReplace =
        force ||
        (metaAccepted && Boolean(meta?.locked)) ||
        remoteShouldReplace(
          remote,
          current,
          previousServerFingerprint,
        );

      if (
        remoteRevision > lastServerRevisionRef.current ||
        (remoteRevision === lastServerRevisionRef.current &&
          remoteUpdatedAt >= lastServerUpdatedAtRef.current)
      ) {
        lastServerRevisionRef.current = remoteRevision;
        lastServerUpdatedAtRef.current = remoteUpdatedAt;
        lastServerFingerprintRef.current = remoteFingerprint;
      }

      if (
        pendingOperationFingerprintRef.current &&
        pendingOperationFingerprintRef.current === remoteFingerprint
      ) {
        pendingOperationKeyRef.current = undefined;
        pendingOperationFingerprintRef.current = "";
      }

      if (!shouldReplace) return false;

      lastServerFingerprintRef.current = remoteFingerprint;
      lastServerRevisionRef.current = remoteRevision;
      lastServerUpdatedAtRef.current = remoteUpdatedAt;
      lastQueuedFingerprintRef.current = "";
      latestSessionRef.current = remote;
      pendingOperationKeyRef.current = undefined;
      pendingOperationFingerprintRef.current = "";
      setLastError(null);
      setState("saved");
      onRemoteSessionRef.current(remote);
      return true;
    },
    [applyRemoteMeta, identityKey, workOrderLineId],
  );

  const pullLatest = useCallback(async () => {
    if (!enabled || (!inspectionId && !workOrderLineId)) return;

    const params = new URLSearchParams();
    if (inspectionId) params.set("inspectionId", inspectionId);
    if (workOrderLineId) params.set("workOrderLineId", workOrderLineId);

    const response = await fetch(
      `/api/inspections/load?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(json?.error ?? "Unable to load saved inspection.");
    }

    if (identityRef.current !== identityKey) return;

    const json = (await response.json().catch(() => null)) as LoadResponse | null;
    const meta: InspectionRemoteMeta = {
      locked: Boolean(json?.inspectionMeta?.locked),
      finalizedAt: json?.inspectionMeta?.finalizedAt ?? null,
      updatedAt: json?.inspectionMeta?.updatedAt ?? null,
    };
    const remote = json?.session;
    if (hasDurableSession(remote)) {
      applyRemote(remote, meta);
    } else {
      applyRemoteMeta(meta);
    }
  }, [
    applyRemote,
    applyRemoteMeta,
    enabled,
    identityKey,
    inspectionId,
    workOrderLineId,
  ]);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setState("hydrating");

    if (!enabled) {
      hydrationPromiseRef.current = Promise.resolve();
      return () => {
        cancelled = true;
      };
    }

    const promise = (async () => {
      try {
        await pullLatest();
        if (!cancelled) {
          setLastError(null);
          setState((current) => (current === "saved" ? current : "idle"));
        }
      } catch (error) {
        if (!cancelled) {
          setLastError(
            error instanceof Error
              ? error.message
              : "Unable to load saved inspection.",
          );
          // Local/offline recovery remains usable and will queue the next save.
          setState(typeof navigator !== "undefined" && !navigator.onLine
            ? "queued"
            : "error");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    hydrationPromiseRef.current = promise;
    return () => {
      cancelled = true;
    };
  }, [pullLatest]);

  useEffect(() => {
    if (!enabled || !workOrderLineId) return;

    const channel = supabase
      .channel(`inspection-live:${workOrderLineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inspections",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = (payload.new ?? {}) as RealtimeInspectionRow;
          const meta: InspectionRemoteMeta = {
            locked: Boolean(row.locked),
            finalizedAt: row.finalized_at ?? null,
            updatedAt: row.updated_at ?? null,
          };
          if (hasDurableSession(row.summary)) {
            applyRemote(row.summary, meta);
          } else {
            applyRemoteMeta(meta);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    applyRemote,
    applyRemoteMeta,
    enabled,
    supabase,
    workOrderLineId,
  ]);

  const persistSnapshot = useCallback(
    async (
      snapshot: InspectionSession,
      requireServer = false,
    ): Promise<PersistResult> => {
      if (identityRef.current !== identityKey) {
        return {
          session: snapshot,
          durable: false,
          queued: false,
          conflicted: true,
        };
      }
      if (!workOrderLineId) {
        throw new Error("Inspection is not attached to a work-order line.");
      }

      if (!sessionMatchesWorkOrderLine(snapshot, workOrderLineId)) {
        const message =
          "Inspection draft belongs to a different work-order line.";
        setLastError(message);
        setState("conflicted");
        return {
          session: snapshot,
          durable: false,
          queued: false,
          conflicted: true,
        };
      }

      const nextFingerprint = fingerprint(snapshot);
      if (
        nextFingerprint &&
        nextFingerprint === lastServerFingerprintRef.current
      ) {
        return {
          session: snapshot,
          durable: true,
          queued: false,
          conflicted: false,
        };
      }

      if (locked) {
        throw new Error("Signed inspection is locked.");
      }

      const offline =
        typeof navigator !== "undefined" && !navigator.onLine;
      if (
        !requireServer &&
        offline &&
        nextFingerprint &&
        nextFingerprint === lastQueuedFingerprintRef.current
      ) {
        return {
          session: snapshot,
          durable: false,
          queued: true,
          conflicted: false,
        };
      }

      if (requireServer && offline) {
        setState("queued");
        const message =
          "Connect to the internet and wait for autosave before signing or finalizing.";
        setLastError(message);
        throw new Error(message);
      }

      const previousOperationKey = pendingOperationKeyRef.current;
      const canReuseOperationKey =
        Boolean(previousOperationKey) &&
        pendingOperationFingerprintRef.current === nextFingerprint;
      const operationKey =
        (canReuseOperationKey ? previousOperationKey : undefined) ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${workOrderLineId}:${Date.now()}`);
      pendingOperationKeyRef.current = operationKey;
      pendingOperationFingerprintRef.current = nextFingerprint;
      setState("saving");
      setLastError(null);

      try {
        const result = await saveInspectionSession(
          snapshot,
          workOrderLineId,
          {
            operationKey,
            requireServer,
            supersedesOperationKey: canReuseOperationKey
              ? undefined
              : previousOperationKey,
          },
        );

        if (identityRef.current !== identityKey) {
          return {
            session: snapshot,
            durable: false,
            queued: false,
            conflicted: true,
          };
        }

        const recoveryState: InspectionDraftRecoveryState = result.conflicted
          ? "conflicted"
          : result.queued
            ? "queued"
            : "editing";

        if (result.queued || result.conflicted) {
          pendingOperationKeyRef.current = result.operationKey;
          pendingOperationFingerprintRef.current = nextFingerprint;
        } else {
          pendingOperationKeyRef.current = undefined;
          pendingOperationFingerprintRef.current = "";
        }

        let persistedSnapshot = snapshot;
        if (!result.queued && !result.conflicted) {
          const acknowledgedSnapshot: InspectionSession = {
            ...snapshot,
            id: result.inspectionId ?? snapshot.id,
            syncRevision: result.syncRevision ?? snapshot.syncRevision,
            serverUpdatedAt:
              result.savedAt ?? snapshot.serverUpdatedAt ?? null,
          };
          const current = latestSessionRef.current;
          const acknowledgementRevision = revision(acknowledgedSnapshot);

          if (!current || fingerprint(current) === nextFingerprint) {
            persistedSnapshot = acknowledgedSnapshot;
            latestSessionRef.current = acknowledgedSnapshot;
            onRemoteSessionRef.current(acknowledgedSnapshot);
          } else if (acknowledgementRevision >= revision(current)) {
            // Preserve edits made while the request was in flight, but advance
            // their concurrency token so the follow-up save is accepted.
            persistedSnapshot = {
              ...current,
              id: acknowledgedSnapshot.id,
              syncRevision: acknowledgedSnapshot.syncRevision,
              serverUpdatedAt: acknowledgedSnapshot.serverUpdatedAt,
            };
            latestSessionRef.current = persistedSnapshot;
            onRemoteSessionRef.current(persistedSnapshot);
          } else {
            // Realtime already delivered a newer server revision.
            persistedSnapshot = current;
          }

          if (acknowledgementRevision >= lastServerRevisionRef.current) {
            lastServerRevisionRef.current = acknowledgementRevision;
            lastServerUpdatedAtRef.current = timestamp(
              acknowledgedSnapshot.serverUpdatedAt,
            );
            // Record only the snapshot the server acknowledged. A newer local
            // edit must remain dirty and receive its own operation key.
            lastServerFingerprintRef.current =
              fingerprint(acknowledgedSnapshot);
          }
          lastQueuedFingerprintRef.current = "";
        } else {
          lastQueuedFingerprintRef.current = nextFingerprint;
        }

        if (draftKey) {
          await saveInspectionOfflineDraft({
            draftKey,
            session: persistedSnapshot,
            state: recoveryState,
            operationKey: pendingOperationKeyRef.current,
          });
        }
        if (identityRef.current !== identityKey) {
          return {
            session: snapshot,
            durable: false,
            queued: false,
            conflicted: true,
          };
        }
        onRecoveryStateRef.current?.(
          recoveryState,
          pendingOperationKeyRef.current,
        );

        if (result.conflicted) setState("conflicted");
        else if (result.queued) setState("queued");
        else setState("saved");

        return {
          session: persistedSnapshot,
          durable: !result.queued && !result.conflicted,
          queued: result.queued,
          conflicted: result.conflicted,
        };
      } catch (error) {
        if (identityRef.current !== identityKey) throw error;
        const message =
          error instanceof Error ? error.message : "Inspection autosave failed.";
        const conflicted = errorStatus(error) === 409;
        pendingOperationKeyRef.current = operationKey;
        pendingOperationFingerprintRef.current = nextFingerprint;
        if (conflicted) {
          lastQueuedFingerprintRef.current = nextFingerprint;
          if (draftKey) {
            await saveInspectionOfflineDraft({
              draftKey,
              session: snapshot,
              state: "conflicted",
              operationKey,
            });
          }
          onRecoveryStateRef.current?.("conflicted", operationKey);
        }
        setLastError(message);
        setState(conflicted ? "conflicted" : "error");
        throw error;
      }
    },
    [draftKey, identityKey, locked, workOrderLineId],
  );

  const queueFlush = useCallback(
    async (
      override: InspectionSession | null | undefined,
      requireServer: boolean,
    ): Promise<InspectionSession | null> => {
      await hydrationPromiseRef.current;
      const task = saveQueueRef.current
        .catch(() => null)
        .then(async () => {
          if (identityRef.current !== identityKey) return null;
          let snapshot = override ?? latestSessionRef.current;
          if (!snapshot || !enabled) return null;

          // A signing/finalization flush is a barrier, not a single request.
          // If the user edits while one snapshot is in flight, persist the
          // patched latest snapshot too before returning its server revision.
          const maxBarrierPasses = requireServer ? 8 : 1;
          for (let pass = 0; pass < maxBarrierPasses; pass += 1) {
            const result = await persistSnapshot(snapshot, requireServer);
            if (identityRef.current !== identityKey) return null;
            if (requireServer && !result.durable) {
              const message = result.conflicted
                ? "A newer inspection was saved on another device. Review it before signing."
                : "Inspection changes are queued but not yet saved to the server.";
              setLastError(message);
              throw new Error(message);
            }

            const latest = latestSessionRef.current ?? result.session;
            if (
              !requireServer ||
              fingerprint(latest) === lastServerFingerprintRef.current
            ) {
              return latest;
            }
            snapshot = latest;
          }

          const message =
            "Inspection kept changing while it was saving. Pause edits and sign again.";
          setLastError(message);
          setState("error");
          throw new Error(message);
        });
      saveQueueRef.current = task;
      return task;
    },
    [enabled, identityKey, persistSnapshot],
  );

  const flush = useCallback(
    (override?: InspectionSession | null) =>
      queueFlush(override, false),
    [queueFlush],
  );

  const flushToServer = useCallback(
    (override?: InspectionSession | null) =>
      queueFlush(override, true),
    [queueFlush],
  );

  useEffect(() => {
    if (
      !enabled ||
      !hydrated ||
      locked ||
      !workOrderLineId ||
      !session
    ) {
      return;
    }

    const nextFingerprint = fingerprint(session);
    const offline =
      typeof navigator !== "undefined" && !navigator.onLine;
    if (
      nextFingerprint &&
      (nextFingerprint === lastServerFingerprintRef.current ||
        (offline && nextFingerprint === lastQueuedFingerprintRef.current))
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void flush().catch(() => {
        // Status and retry UI are handled by the hook.
      });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [
    debounceMs,
    enabled,
    flush,
    hydrated,
    locked,
    session,
    workOrderLineId,
  ]);

  useEffect(() => {
    if (!enabled || !hydrated) return;

    const flushLatest = () => {
      if (!locked) {
        void flush().catch(() => {
          // The durable local draft remains the unload fallback.
        });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushLatest();
    };
    const onOnline = () => {
      flushLatest();
    };
    const onFocus = () => {
      void pullLatest().catch(() => {
        // Realtime remains primary; focus refresh is a fallback.
      });
    };

    window.addEventListener("pagehide", flushLatest);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushLatest);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, flush, hydrated, locked, pullLatest]);

  return {
    state,
    hydrated,
    lastError,
    flush,
    flushToServer,
    refresh: pullLatest,
    label: inspectionSyncLabel(state, locked),
  };
}
