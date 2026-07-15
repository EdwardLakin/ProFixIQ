"use client";

export type OfflineMutationStatus =
  | "queued"
  | "syncing"
  | "failed"
  | "synced"
  | "conflicted";

export type OfflineMutationScope = {
  userId: string;
  shopId: string;
};

export type PendingMutation<T = unknown> = {
  clientMutationId: string;
  actionType: string;
  payload: T;
  createdAt: string;
  retryCount: number;
  userId: string;
  shopId: string;
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

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
};

export type OfflineMutationRunner = (
  mutation: PendingMutation,
) => Promise<{ conflicted?: string | null } | void>;

const KEY = "profixiq.pending_mutations.v3";
const PREVIOUS_KEY = "profixiq.pending_mutations.v2";
const LEGACY_KEY = "profixiq.pending_mutations.v1";
const SCOPE_KEY = "profixiq.pending_mutations.scope.v1";
const EVENT_NAME = "offline-mutations:updated";
const MAX_HISTORY = 300;
const TERMINAL_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 409, 410, 412, 422]);

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function setOfflineMutationScope(scope: OfflineMutationScope | null): void {
  if (!hasWindow()) return;
  if (!scope?.userId || !scope.shopId) {
    localStorage.removeItem(SCOPE_KEY);
  } else {
    localStorage.setItem(
      SCOPE_KEY,
      JSON.stringify({ userId: scope.userId.trim(), shopId: scope.shopId.trim() }),
    );
  }
  emitQueueUpdate();
}

export function getOfflineMutationScope(): OfflineMutationScope | null {
  if (!hasWindow()) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SCOPE_KEY) ?? "null") as
      | Partial<OfflineMutationScope>
      | null;
    const userId = cleanId(parsed?.userId);
    const shopId = cleanId(parsed?.shopId);
    return userId && shopId ? { userId, shopId } : null;
  } catch {
    return null;
  }
}

function scopeMatches(
  mutation: Pick<PendingMutation, "userId" | "shopId">,
  scope: OfflineMutationScope | null,
): boolean {
  return Boolean(
    scope && mutation.userId === scope.userId && mutation.shopId === scope.shopId,
  );
}

function toPendingMutation(raw: unknown): PendingMutation | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<PendingMutation>;
  if (!candidate.clientMutationId || !candidate.actionType || !candidate.createdAt) {
    return null;
  }

  const status: OfflineMutationStatus =
    candidate.status &&
    ["queued", "syncing", "failed", "synced", "conflicted"].includes(
      candidate.status,
    )
      ? candidate.status
      : "queued";
  const userId = cleanId(candidate.userId);
  const shopId = cleanId(candidate.shopId);
  const missingScope = !userId || !shopId;

  return {
    clientMutationId: String(candidate.clientMutationId),
    actionType: String(candidate.actionType),
    payload: candidate.payload,
    createdAt: String(candidate.createdAt),
    retryCount: typeof candidate.retryCount === "number" ? candidate.retryCount : 0,
    userId,
    shopId,
    dependsOn: Array.isArray(candidate.dependsOn)
      ? candidate.dependsOn.map(String)
      : undefined,
    orderKey:
      typeof candidate.orderKey === "string" ? candidate.orderKey : undefined,
    status: missingScope && status !== "synced" ? "conflicted" : status,
    lastError:
      typeof candidate.lastError === "string" ? candidate.lastError : undefined,
    conflictReason: missingScope
      ? "Legacy offline mutation has no authenticated user/shop scope. Re-enter the action."
      : typeof candidate.conflictReason === "string"
        ? candidate.conflictReason
        : undefined,
    syncedAt:
      typeof candidate.syncedAt === "string" ? candidate.syncedAt : undefined,
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
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .slice(trimmed.length - MAX_HISTORY);
}

function emitQueueUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

function migrateOldQueues(): PendingMutation[] {
  if (!hasWindow()) return [];
  const migrated: PendingMutation[] = [];
  for (const storageKey of [PREVIOUS_KEY, LEGACY_KEY]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const raw of parsed) {
        if (storageKey === LEGACY_KEY) {
          const entry = raw as Partial<LegacyMutation>;
          if (!entry.id || !entry.action || !entry.createdAt) continue;
          migrated.push({
            clientMutationId: String(entry.id),
            actionType: String(entry.action),
            payload: entry.payload,
            createdAt: String(entry.createdAt),
            retryCount:
              typeof entry.retryCount === "number" ? entry.retryCount : 0,
            userId: "",
            shopId: "",
            status: "conflicted",
            conflictReason:
              "Legacy offline mutation has no authenticated user/shop scope. Re-enter the action.",
          });
        } else {
          const converted = toPendingMutation(raw);
          if (converted) migrated.push(converted);
        }
      }
      localStorage.removeItem(storageKey);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }
  return migrated;
}

function readQueue(): PendingMutation[] {
  if (!hasWindow()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    const current = Array.isArray(parsed)
      ? parsed
          .map(toPendingMutation)
          .filter((entry): entry is PendingMutation => entry !== null)
      : [];
    const migrated = migrateOldQueues();
    if (migrated.length) {
      const combined = normalizeQueue([...current, ...migrated]);
      localStorage.setItem(KEY, JSON.stringify(combined));
      return combined;
    }
    return current;
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingMutation[]): void {
  if (!hasWindow()) return;
  localStorage.setItem(KEY, JSON.stringify(normalizeQueue(queue)));
  emitQueueUpdate();
}

function sortForReplay(queue: PendingMutation[]): PendingMutation[] {
  return [...queue].sort((a, b) => {
    const timeDiff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    const orderDiff = (a.orderKey ?? "").localeCompare(b.orderKey ?? "");
    return orderDiff || a.clientMutationId.localeCompare(b.clientMutationId);
  });
}

function upsertMutation(next: PendingMutation): void {
  const queue = readQueue();
  const index = queue.findIndex(
    (item) => item.clientMutationId === next.clientMutationId,
  );
  if (index >= 0) queue[index] = next;
  else queue.push(next);
  writeQueue(queue);
}

export function enqueueMutation<T>(
  entry: Omit<PendingMutation<T>, "createdAt" | "retryCount" | "status"> & {
    status?: OfflineMutationStatus;
  },
): PendingMutation<T> {
  if (!entry.userId.trim() || !entry.shopId.trim()) {
    throw new Error("Offline mutation scope requires userId and shopId.");
  }
  const existing = getMutation(entry.clientMutationId);
  const next: PendingMutation<T> = {
    clientMutationId: entry.clientMutationId,
    actionType: entry.actionType,
    payload: entry.payload,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    retryCount: existing?.retryCount ?? 0,
    userId: entry.userId.trim(),
    shopId: entry.shopId.trim(),
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

export function getMutation(clientMutationId: string): PendingMutation | null {
  return (
    readQueue().find((item) => item.clientMutationId === clientMutationId) ?? null
  );
}

export function markMutationStatus(args: {
  clientMutationId: string;
  status: OfflineMutationStatus;
  error?: string;
  conflictReason?: string;
  incrementRetry?: boolean;
}): void {
  const existing = getMutation(args.clientMutationId);
  if (!existing) return;
  upsertMutation({
    ...existing,
    retryCount: args.incrementRetry
      ? existing.retryCount + 1
      : existing.retryCount,
    status: args.status,
    lastError: args.error,
    conflictReason: args.conflictReason,
    syncedAt:
      args.status === "synced" ? new Date().toISOString() : existing.syncedAt,
  });
}

export function listPendingMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): PendingMutation[] {
  return readQueue().filter(
    (item) => item.status !== "synced" && scopeMatches(item, scope),
  );
}

export function listOfflineMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): PendingMutation[] {
  return sortForReplay(readQueue().filter((item) => scopeMatches(item, scope)));
}

export function getOfflineSyncSummary(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
) {
  const summary = {
    queued: 0,
    syncing: 0,
    failed: 0,
    conflicted: 0,
    synced: 0,
    total: 0,
  };
  for (const item of readQueue().filter((entry) => scopeMatches(entry, scope))) {
    summary[item.status] += 1;
    summary.total += 1;
  }
  return summary;
}

export function removeMutation(clientMutationId: string): void {
  writeQueue(
    readQueue().filter((item) => item.clientMutationId !== clientMutationId),
  );
}

export function subscribeOfflineMutations(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}

function numericStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as ErrorLike).status ?? (error as ErrorLike).statusCode;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRetryableOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const status = numericStatus(error);
  if (status != null) {
    if (PERMANENT_STATUS_CODES.has(status)) return false;
    if (RETRYABLE_STATUS_CODES.has(status)) return true;
  }
  const candidate = error as ErrorLike | null;
  const code = cleanId(candidate?.code).toUpperCase();
  if (["PGRST301", "42501", "23503", "23505", "22P02"].includes(code)) {
    return false;
  }
  const message = cleanId(candidate?.message ?? error).toLowerCase();
  if (
    /unauthorized|forbidden|validation|invalid|not found|financially_locked|conflict|already completed|cannot/.test(
      message,
    )
  ) {
    return false;
  }
  return (
    error instanceof TypeError ||
    /network|fetch failed|failed to fetch|timeout|timed out|connection|offline|temporarily unavailable/.test(
      message,
    )
  );
}

export async function replayQueuedMutations(args: {
  handlers: Record<string, OfflineMutationRunner>;
  scope?: OfflineMutationScope | null;
}): Promise<{ replayed: number; failed: number; conflicted: number }> {
  const scope = args.scope ?? getOfflineMutationScope();
  const queue = sortForReplay(
    readQueue().filter(
      (item) =>
        (item.status === "queued" || item.status === "failed") &&
        scopeMatches(item, scope),
    ),
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
        status: "conflicted",
        conflictReason: `No replay handler registered for ${mutation.actionType}`,
      });
      conflicted += 1;
      continue;
    }

    markMutationStatus({
      clientMutationId: mutation.clientMutationId,
      status: "syncing",
    });
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
      markMutationStatus({
        clientMutationId: mutation.clientMutationId,
        status: "synced",
      });
      replayed += 1;
    } catch (error) {
      const retryable = isRetryableOfflineError(error);
      markMutationStatus({
        clientMutationId: mutation.clientMutationId,
        status: retryable ? "failed" : "conflicted",
        error: error instanceof Error ? error.message : "Replay failed",
        conflictReason: retryable
          ? undefined
          : "Server rejected this update. Review it before retrying.",
        incrementRetry: true,
      });
      if (retryable) failed += 1;
      else conflicted += 1;
    }
  }
  return { replayed, failed, conflicted };
}

export async function runMutationWithOfflineQueue<T>(args: {
  clientMutationId: string;
  actionType: string;
  payload: T;
  runner: () => Promise<void>;
  scope?: OfflineMutationScope | null;
  queueOnOffline?: boolean;
  dependsOn?: string[];
  orderKey?: string;
  conflictCheck?: () => Promise<string | null>;
}): Promise<{ queued: boolean; conflicted: boolean }> {
  const queueOnOffline = args.queueOnOffline !== false;
  const scope = args.scope ?? getOfflineMutationScope();
  if (!scope?.userId || !scope.shopId) {
    throw new Error("Authenticated user and shop scope are required for offline sync.");
  }
  const existing = getMutation(args.clientMutationId);
  if (existing?.status === "synced" && scopeMatches(existing, scope)) {
    return { queued: false, conflicted: false };
  }

  const queueEntry = (status: OfflineMutationStatus = "queued") =>
    enqueueMutation({
      clientMutationId: args.clientMutationId,
      actionType: args.actionType,
      payload: args.payload,
      userId: scope.userId,
      shopId: scope.shopId,
      dependsOn: args.dependsOn,
      orderKey: args.orderKey,
      status,
    });

  if (queueOnOffline && typeof navigator !== "undefined" && !navigator.onLine) {
    queueEntry();
    return { queued: true, conflicted: false };
  }

  try {
    if (args.conflictCheck) {
      const conflict = await args.conflictCheck();
      if (conflict) {
        queueEntry("conflicted");
        markMutationStatus({
          clientMutationId: args.clientMutationId,
          status: "conflicted",
          conflictReason: conflict,
        });
        return { queued: false, conflicted: true };
      }
    }
    await args.runner();
    queueEntry("synced");
    return { queued: false, conflicted: false };
  } catch (error) {
    if (queueOnOffline && isRetryableOfflineError(error)) {
      queueEntry();
      return { queued: true, conflicted: false };
    }
    throw error;
  }
}
