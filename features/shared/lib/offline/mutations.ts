"use client";

export type OfflineMutationStatus =
  | "queued"
  | "syncing"
  | "failed"
  | "synced"
  | "conflicted";

export type PendingMutation<T = unknown> = {
  clientMutationId: string;
  actionType: string;
  payload: T;
  createdAt: string;
  retryCount: number;
  dependsOn?: string[];
  orderKey?: string;
  status: OfflineMutationStatus;
  lastError?: string;
  conflictReason?: string;
  syncedAt?: string;
};

type LegacyMutation = {
  id: string;
  action: string;
  payload: unknown;
  createdAt: string;
  retryCount: number;
};

export type OfflineMutationRunner = (
  mutation: PendingMutation,
) => Promise<{ conflicted?: string | null } | void>;

const KEY = "profixiq.pending_mutations.v2";
const LEGACY_KEY = "profixiq.pending_mutations.v1";
const EVENT_NAME = "offline-mutations:updated";
const MAX_HISTORY = 300;
const TERMINAL_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;

function toPendingMutation(raw: unknown): PendingMutation | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<PendingMutation>;
  if (!candidate.clientMutationId || !candidate.actionType || !candidate.createdAt) {
    return null;
  }

  const status: OfflineMutationStatus =
    candidate.status &&
    ["queued", "syncing", "failed", "synced", "conflicted"].includes(candidate.status)
      ? candidate.status
      : "queued";

  return {
    clientMutationId: String(candidate.clientMutationId),
    actionType: String(candidate.actionType),
    payload: candidate.payload,
    createdAt: String(candidate.createdAt),
    retryCount: typeof candidate.retryCount === "number" ? candidate.retryCount : 0,
    dependsOn: Array.isArray(candidate.dependsOn) ? candidate.dependsOn.map(String) : undefined,
    orderKey: typeof candidate.orderKey === "string" ? candidate.orderKey : undefined,
    status,
    lastError: typeof candidate.lastError === "string" ? candidate.lastError : undefined,
    conflictReason:
      typeof candidate.conflictReason === "string" ? candidate.conflictReason : undefined,
    syncedAt: typeof candidate.syncedAt === "string" ? candidate.syncedAt : undefined,
  };
}

function normalizeQueue(queue: PendingMutation[]): PendingMutation[] {
  const now = Date.now();
  const trimmed = queue.filter((item) => {
    if (item.status !== "synced") return true;
    if (!item.syncedAt) return false;
    return now - new Date(item.syncedAt).getTime() < TERMINAL_RETENTION_MS;
  });

  if (trimmed.length <= MAX_HISTORY) return trimmed;
  return trimmed
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(trimmed.length - MAX_HISTORY);
}

function emitQueueUpdate() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function readLegacyQueue(): PendingMutation[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyMutation[];
    if (!Array.isArray(parsed)) return [];
    const migrated: PendingMutation[] = [];
    for (const entry of parsed) {
      if (!entry?.id || !entry?.action || !entry?.createdAt) continue;
      migrated.push({
        clientMutationId: String(entry.id),
        actionType: String(entry.action),
        payload: entry.payload,
        createdAt: String(entry.createdAt),
        retryCount: typeof entry.retryCount === "number" ? entry.retryCount : 0,
        status: "queued",
      });
    }
    return migrated;
  } catch {
    return [];
  }
}

function readQueue(): PendingMutation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(toPendingMutation)
          .filter((entry): entry is PendingMutation => entry !== null);
      }
    }

    const migrated = readLegacyQueue();
    if (migrated.length) {
      writeQueue(migrated);
      localStorage.removeItem(LEGACY_KEY);
    }
    return migrated;
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingMutation[]) {
  localStorage.setItem(KEY, JSON.stringify(normalizeQueue(queue)));
  emitQueueUpdate();
}

function sortForReplay(queue: PendingMutation[]): PendingMutation[] {
  return [...queue].sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    const orderDiff = (a.orderKey ?? "").localeCompare(b.orderKey ?? "");
    if (orderDiff !== 0) return orderDiff;
    return a.clientMutationId.localeCompare(b.clientMutationId);
  });
}

function upsertMutation(next: PendingMutation) {
  const queue = readQueue();
  const idx = queue.findIndex((item) => item.clientMutationId === next.clientMutationId);
  if (idx >= 0) queue[idx] = next;
  else queue.push(next);
  writeQueue(queue);
}

export function enqueueMutation<T>(
  entry: Omit<PendingMutation<T>, "createdAt" | "retryCount" | "status"> & {
    status?: OfflineMutationStatus;
  },
) {
  const existing = getMutation(entry.clientMutationId);
  const next: PendingMutation<T> = {
    clientMutationId: entry.clientMutationId,
    actionType: entry.actionType,
    payload: entry.payload,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    retryCount: existing?.retryCount ?? 0,
    dependsOn: entry.dependsOn,
    orderKey: entry.orderKey,
    status: entry.status ?? "queued",
    lastError: existing?.lastError,
    conflictReason: existing?.conflictReason,
    syncedAt: existing?.syncedAt,
  };

  upsertMutation(next);
  return next;
}

export function getMutation(clientMutationId: string) {
  return readQueue().find((item) => item.clientMutationId === clientMutationId) ?? null;
}

export function markMutationStatus(args: {
  clientMutationId: string;
  status: OfflineMutationStatus;
  error?: string;
  conflictReason?: string;
  incrementRetry?: boolean;
}) {
  const existing = getMutation(args.clientMutationId);
  if (!existing) return;

  const retryCount = args.incrementRetry ? existing.retryCount + 1 : existing.retryCount;

  upsertMutation({
    ...existing,
    retryCount,
    status: args.status,
    lastError: args.error,
    conflictReason: args.conflictReason,
    syncedAt: args.status === "synced" ? new Date().toISOString() : existing.syncedAt,
  });
}

export function listPendingMutations() {
  return readQueue().filter((item) => item.status !== "synced");
}

export function listOfflineMutations() {
  return sortForReplay(readQueue());
}

export function getOfflineSyncSummary() {
  const summary = {
    queued: 0,
    syncing: 0,
    failed: 0,
    conflicted: 0,
    synced: 0,
    total: 0,
  };

  for (const item of readQueue()) {
    summary[item.status] += 1;
    summary.total += 1;
  }

  return summary;
}

export function removeMutation(clientMutationId: string) {
  writeQueue(readQueue().filter((item) => item.clientMutationId !== clientMutationId));
}

export function subscribeOfflineMutations(listener: () => void) {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}

export async function replayQueuedMutations(args: {
  handlers: Record<string, OfflineMutationRunner>;
}): Promise<{ replayed: number; failed: number; conflicted: number }> {
  const queue = sortForReplay(
    readQueue().filter((item) => item.status === "queued" || item.status === "failed"),
  );

  let replayed = 0;
  let failed = 0;
  let conflicted = 0;

  for (const mutation of queue) {
    const hasPendingDependencies =
      mutation.dependsOn?.some((dependencyId) => {
        const dependency = getMutation(dependencyId);
        return dependency && dependency.status !== "synced";
      }) ?? false;

    if (hasPendingDependencies) continue;

    const handler = args.handlers[mutation.actionType];
    if (!handler) {
      markMutationStatus({
        clientMutationId: mutation.clientMutationId,
        status: "failed",
        error: `No replay handler registered for ${mutation.actionType}`,
        incrementRetry: true,
      });
      failed += 1;
      continue;
    }

    markMutationStatus({ clientMutationId: mutation.clientMutationId, status: "syncing" });

    try {
      const result = await handler(mutation);
      if (result?.conflicted) {
        markMutationStatus({
          clientMutationId: mutation.clientMutationId,
          status: "conflicted",
          conflictReason: result.conflicted,
          incrementRetry: true,
        });
        conflicted += 1;
        continue;
      }

      markMutationStatus({ clientMutationId: mutation.clientMutationId, status: "synced" });
      replayed += 1;
    } catch (error) {
      markMutationStatus({
        clientMutationId: mutation.clientMutationId,
        status: "failed",
        error: error instanceof Error ? error.message : "Replay failed",
        incrementRetry: true,
      });
      failed += 1;
    }
  }

  return { replayed, failed, conflicted };
}

export async function runMutationWithOfflineQueue<T>(args: {
  clientMutationId: string;
  actionType: string;
  payload: T;
  runner: () => Promise<void>;
  queueOnOffline?: boolean;
  dependsOn?: string[];
  orderKey?: string;
  conflictCheck?: () => Promise<string | null>;
}): Promise<{ queued: boolean; conflicted: boolean }> {
  const queueOnOffline = args.queueOnOffline !== false;
  const existing = getMutation(args.clientMutationId);

  if (existing?.status === "synced") {
    return { queued: false, conflicted: false };
  }

  const queueEntry = () => {
    enqueueMutation({
      clientMutationId: args.clientMutationId,
      actionType: args.actionType,
      payload: args.payload,
      dependsOn: args.dependsOn,
      orderKey: args.orderKey,
      status: "queued",
    });
  };

  if (queueOnOffline && typeof navigator !== "undefined" && !navigator.onLine) {
    queueEntry();
    return { queued: true, conflicted: false };
  }

  try {
    if (args.conflictCheck) {
      const conflict = await args.conflictCheck();
      if (conflict) {
        enqueueMutation({
          clientMutationId: args.clientMutationId,
          actionType: args.actionType,
          payload: args.payload,
          dependsOn: args.dependsOn,
          orderKey: args.orderKey,
          status: "conflicted",
        });
        markMutationStatus({
          clientMutationId: args.clientMutationId,
          status: "conflicted",
          conflictReason: conflict,
        });
        return { queued: false, conflicted: true };
      }
    }

    await args.runner();
    enqueueMutation({
      clientMutationId: args.clientMutationId,
      actionType: args.actionType,
      payload: args.payload,
      dependsOn: args.dependsOn,
      orderKey: args.orderKey,
      status: "synced",
    });
    markMutationStatus({ clientMutationId: args.clientMutationId, status: "synced" });
    return { queued: false, conflicted: false };
  } catch {
    if (queueOnOffline) {
      queueEntry();
      return { queued: true, conflicted: false };
    }
    throw new Error("Mutation failed");
  }
}
