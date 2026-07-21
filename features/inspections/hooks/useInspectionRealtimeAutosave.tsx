"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  replayQueuedInspectionSaves,
  saveInspectionSession,
} from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";

export type InspectionSyncState =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "error";

type UseInspectionRealtimeAutosaveArgs = {
  session: InspectionSession | null | undefined;
  workOrderLineId: string | null | undefined;
  enabled?: boolean;
  locked?: boolean;
  debounceMs?: number;
  onRemoteSession: (session: InspectionSession) => void;
  onRemoteLocked?: () => void;
};

type RealtimeSessionRow = {
  state?: unknown;
  updated_at?: string | null;
};

type RealtimeInspectionRow = {
  locked?: boolean | null;
  summary?: unknown;
  updated_at?: string | null;
};

function sessionTimestamp(session: InspectionSession | null | undefined): number {
  const value = session?.lastUpdated;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isInspectionSession(value: unknown): value is InspectionSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<InspectionSession>;
  return Array.isArray(candidate.sections);
}

export function useInspectionRealtimeAutosave({
  session,
  workOrderLineId,
  enabled = true,
  locked = false,
  debounceMs = 800,
  onRemoteSession,
  onRemoteLocked,
}: UseInspectionRealtimeAutosaveArgs): InspectionSyncState {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [state, setState] = useState<InspectionSyncState>("idle");
  const currentSessionRef = useRef(session);
  const onRemoteSessionRef = useRef(onRemoteSession);
  const onRemoteLockedRef = useRef(onRemoteLocked);
  const skipNextSerializedRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    currentSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    onRemoteSessionRef.current = onRemoteSession;
  }, [onRemoteSession]);

  useEffect(() => {
    onRemoteLockedRef.current = onRemoteLocked;
  }, [onRemoteLocked]);

  useEffect(() => {
    if (!enabled || locked || !session || !workOrderLineId) return;

    const serialized = JSON.stringify(session);
    if (skipNextSerializedRef.current === serialized) {
      skipNextSerializedRef.current = null;
      setState("saved");
      return;
    }

    const sequence = ++saveSequenceRef.current;
    setState("saving");

    const timer = window.setTimeout(() => {
      void saveInspectionSession(session, workOrderLineId)
        .then((result) => {
          if (sequence !== saveSequenceRef.current) return;
          setState(result.queued || result.conflicted ? "offline" : "saved");
        })
        .catch((error: unknown) => {
          if (sequence !== saveSequenceRef.current) return;
          console.error("[inspection] autosave failed", error);
          setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [debounceMs, enabled, locked, session, workOrderLineId]);

  useEffect(() => {
    if (!workOrderLineId) return;

    const applyRemoteSession = (value: unknown) => {
      if (!isInspectionSession(value)) return;

      const remoteAt = sessionTimestamp(value);
      const localAt = sessionTimestamp(currentSessionRef.current);
      if (remoteAt > 0 && localAt > remoteAt) return;

      const serialized = JSON.stringify(value);
      if (serialized === JSON.stringify(currentSessionRef.current ?? null)) return;

      skipNextSerializedRef.current = serialized;
      currentSessionRef.current = value;
      onRemoteSessionRef.current(value);
      setState("saved");
    };

    const channel = supabase
      .channel(`inspection-progress:${workOrderLineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inspection_sessions",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeSessionRow;
          applyRemoteSession(row?.state);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "inspections",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeInspectionRow;
          if (row?.locked) {
            onRemoteLockedRef.current?.();
            return;
          }
          applyRemoteSession(row?.summary);
        },
      )
      .subscribe();

    const handleOnline = () => {
      void replayQueuedInspectionSaves().catch((error: unknown) => {
        console.error("[inspection] queued autosave replay failed", error);
      });
    };
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      void supabase.removeChannel(channel);
    };
  }, [supabase, workOrderLineId]);

  return state;
}

export function InspectionAutosaveStatus({
  state,
}: {
  state: InspectionSyncState;
}) {
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "offline"
          ? "Saved on device · syncing"
          : state === "error"
            ? "Autosave needs attention"
            : "Autosave ready";

  return (
    <span
      aria-live="polite"
      className={
        state === "error"
          ? "text-[11px] text-red-500"
          : "text-[11px] text-[color:var(--theme-text-secondary)]"
      }
    >
      {label}
    </span>
  );
}
