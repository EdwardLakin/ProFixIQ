"use client";

import {
  getOfflineSnapshot,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  getOfflineMutationScope,
  runMutationWithOfflineQueue,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import type { MobileShiftState } from "@/features/mobile/shifts/client";

export type MobileShiftAction =
  | "start_shift"
  | "end_shift"
  | "start_break"
  | "end_break"
  | "start_lunch"
  | "end_lunch";

const KIND = "mobile-shift-state";
const ENTITY_ID = "current";

function eventType(action: MobileShiftAction): string {
  const events: Record<MobileShiftAction, string> = {
    start_shift: "start_shift",
    end_shift: "end_shift",
    start_break: "break_start",
    end_break: "break_end",
    start_lunch: "lunch_start",
    end_lunch: "lunch_end",
  };
  return events[action];
}

function operationKey(action: MobileShiftAction): string {
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `shift:${action}:${id}`;
}

function optimisticState(
  current: MobileShiftState,
  action: MobileShiftAction,
  occurredAt: string,
): MobileShiftState {
  if (action === "end_shift") {
    return {
      ...current,
      shiftStatus: "completed",
      activity: "off_shift",
      endTime: occurredAt,
      latestEventType: "end_shift",
      latestEventAt: occurredAt,
      mode: "ended",
    };
  }
  if (action === "start_break" || action === "end_break") {
    const starting = action === "start_break";
    return {
      ...current,
      activity: starting ? "on_break" : "working",
      latestEventType: starting ? "break_start" : "break_end",
      latestEventAt: occurredAt,
      mode: starting ? "break" : "shift",
    };
  }
  if (action === "start_lunch" || action === "end_lunch") {
    const starting = action === "start_lunch";
    return {
      ...current,
      activity: starting ? "on_lunch" : "working",
      latestEventType: starting ? "lunch_start" : "lunch_end",
      latestEventAt: occurredAt,
      mode: starting ? "lunch" : "shift",
    };
  }
  return current;
}

export async function saveCachedMobileShiftState(args: {
  scope: OfflineMutationScope;
  state: MobileShiftState;
}): Promise<void> {
  await saveOfflineSnapshot({
    scope: args.scope,
    kind: KIND,
    entityId: ENTITY_ID,
    data: args.state,
  });
}

export async function getCachedMobileShiftState(
  scope: OfflineMutationScope,
): Promise<MobileShiftState | null> {
  const snapshot = await getOfflineSnapshot<MobileShiftState>({
    scope,
    kind: KIND,
    entityId: ENTITY_ID,
  });
  return snapshot?.data ?? null;
}

async function postShiftAction(
  action: MobileShiftAction,
  key: string,
): Promise<MobileShiftState> {
  const response = await fetch("/api/mobile/shifts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ action, operationKey: key }),
  });
  const body = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & Partial<MobileShiftState>)
    | null;
  if (!response.ok || !body?.ok) {
    const error = new Error(
      body?.error ?? "Failed to update shift",
    ) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return {
    shiftId: body.shiftId ?? null,
    shiftStatus: body.shiftStatus ?? null,
    activity: body.activity ?? "off_shift",
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    latestEventType: body.latestEventType ?? null,
    latestEventAt: body.latestEventAt ?? null,
    mode: body.mode ?? "none",
  };
}

export async function runMobileShiftAction(args: {
  action: MobileShiftAction;
  current: MobileShiftState | null;
}): Promise<{
  state: MobileShiftState;
  queued: boolean;
  conflicted: boolean;
}> {
  const scope = getOfflineMutationScope();
  const key = operationKey(args.action);

  if (args.action === "start_shift") {
    if (!navigator.onLine) {
      throw new Error("Starting a new shift requires a connection.");
    }
    const state = await postShiftAction(args.action, key);
    if (scope) await saveCachedMobileShiftState({ scope, state });
    return { state, queued: false, conflicted: false };
  }

  if (!args.current?.shiftId) throw new Error("No active shift is available.");

  // Online actions must use the same canonical server lifecycle as desktop.
  // Offline scope is only required when the event actually needs to be queued.
  if (navigator.onLine) {
    const state = await postShiftAction(args.action, key);
    if (scope) await saveCachedMobileShiftState({ scope, state });
    return { state, queued: false, conflicted: false };
  }

  if (!scope) {
    throw new Error(
      "This device is missing its shop scope. Reconnect before recording this punch.",
    );
  }

  const occurredAt = new Date().toISOString();
  let serverState: MobileShiftState | null = null;
  const result = await runMutationWithOfflineQueue({
    clientMutationId: key,
    actionType: "shift:punch-event",
    payload: {
      shift_id: args.current.shiftId,
      event_type: eventType(args.action),
      timestamp: occurredAt,
      operationKey: key,
    },
    orderKey: `${args.current.shiftId}:shift:${occurredAt}:${key}`,
    scope,
    runner: async () => {
      serverState = await postShiftAction(args.action, key);
    },
  });
  const state =
    serverState ?? optimisticState(args.current, args.action, occurredAt);
  await saveCachedMobileShiftState({ scope, state });
  return { state, ...result };
}
