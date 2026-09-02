"use client";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  claimStoredMutationForReplay,
  clearOfflineDatabase,
  clearOfflineDatabasePreservingUnsyncedWork,
  collectRequiredOfflineMutationIds,
  deleteStoredMutations,
  deleteSyncedStoredMutations,
  getOfflineBlob,
  insertStoredMutationsIfMissing,
  offlineMutationStorageAvailable,
  pruneOfflineDatabase,
  readStoredMutations,
  recoverInterruptedStoredMutations,
  removeOfflineBlob,
  upsertStoredMutations,
  withOfflineDatabaseWriteLock,
  type OfflineDatabaseWriteLock,
  type StoredOfflineMutation,
} from "@/features/shared/lib/offline/database";
import { checkOfflineReplaySession } from "@/features/shared/lib/offline/session";

export type OfflineMutationStatus = StoredOfflineMutation["status"];
export type OfflineMutationScope = { userId: string; shopId: string };
export type PendingMutation<T = unknown> = Omit<
  StoredOfflineMutation,
  "payload"
> & { payload: T };

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
};

type ScopePayload = {
  userId?: unknown;
  user_id?: unknown;
  shopId?: unknown;
  shop_id?: unknown;
  workOrderId?: unknown;
  work_order_id?: unknown;
  workOrderLineId?: unknown;
  lineId?: unknown;
  work_order_line_id?: unknown;
};

export type OfflineMutationRunner = (
  mutation: PendingMutation,
) => Promise<{ conflicted?: string | null } | void>;

type OfflineReplayResult = {
  replayed: number;
  failed: number;
  conflicted: number;
};

type OfflineReplayLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

const LEGACY_KEYS = [
  "profixiq.pending_mutations.v3",
  "profixiq.pending_mutations.v2",
  "profixiq.pending_mutations.v1",
];
const SCOPE_KEY = "profixiq.pending_mutations.scope.v1";
const PERSISTENCE_MARKER_KEY = "profixiq.offline.persistence.v1";
const QUEUE_REVISION_KEY = "profixiq.pending_mutations.revision.v1";
const QUEUE_CHANNEL_NAME = "profixiq.pending_mutations.channel.v1";
const EVENT_NAME = "offline-mutations:updated";
const REPLAY_LOCK_PREFIX = "profixiq.offline.replay.v1";
const REPLAY_RUN_LOCK_PREFIX = "profixiq.offline.replay-run.v1";
const MUTATION_RUN_LOCK_PREFIX = "profixiq.offline.mutation-run.v1";
const QUEUE_EPOCH_KEY = "profixiq.pending_mutations.epoch.v1";
const MAX_HISTORY = 300;
const TERMINAL_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PERMANENT_STATUS_CODES = new Set([
  400, 401, 403, 404, 409, 410, 412, 422,
]);

let queueCache: PendingMutation[] = [];
let hydrationPromise: Promise<void> | null = null;
let storageRefreshRequestGeneration = 0;
let storageRefreshAppliedGeneration = 0;
let queueChannel: BroadcastChannel | null = null;
let crossTabListenersInstalled = false;
let queueLifecycleEpoch = 0;

type QueueWriteEpoch = {
  local: number;
  shared: string;
};

type OfflinePersistenceMarker = {
  userId: string;
  shopId: string;
  pendingMutations: number;
  pendingAttachments: number;
  updatedAt: string;
};

export type OfflinePersistenceHealth = {
  expectedPendingMutations: number;
  storedPendingMutations: number;
  expectedPendingAttachments: number;
  suspectedEviction: boolean;
};

export type OfflineAttachmentAudit = {
  checked: number;
  missing: number;
  invalid: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function browserReady(): boolean {
  try {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readSharedQueueEpoch(): string {
  if (!browserReady()) return "";
  try {
    return localStorage.getItem(QUEUE_EPOCH_KEY) ?? "";
  } catch {
    return "";
  }
}

function captureQueueWriteEpoch(): QueueWriteEpoch {
  return {
    local: queueLifecycleEpoch,
    shared: readSharedQueueEpoch(),
  };
}

function advanceQueueWriteEpoch(): void {
  queueLifecycleEpoch += 1;
  if (!browserReady()) return;
  try {
    localStorage.setItem(
      QUEUE_EPOCH_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // The module-local epoch still fences this tab when localStorage is blocked.
  }
}

function queueWriteEpochMatches(expected: QueueWriteEpoch): boolean {
  return (
    expected.local === queueLifecycleEpoch &&
    expected.shared === readSharedQueueEpoch()
  );
}

function assertQueueWriteEpoch(
  expected: QueueWriteEpoch,
  scope: OfflineMutationScope,
): void {
  const currentScope = getOfflineMutationScope();
  if (!queueWriteEpochMatches(expected) || !scopeMatches(scope, currentScope)) {
    throw new Error("Authenticated user or shop changed before this update.");
  }
}

function emptyReplayResult(): OfflineReplayResult {
  return { replayed: 0, failed: 0, conflicted: 0 };
}

function getOfflineReplayLockManager(): OfflineReplayLockManager | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (
    navigator as Navigator & {
      locks?: { request?: unknown };
    }
  ).locks;
  return candidate && typeof candidate.request === "function"
    ? (candidate as OfflineReplayLockManager)
    : null;
}

function offlineReplayLockName(scope: OfflineMutationScope): string {
  return `${REPLAY_LOCK_PREFIX}:${scope.userId}:${scope.shopId}`;
}

function offlineReplayRunLockName(scope: OfflineMutationScope): string {
  return `${REPLAY_RUN_LOCK_PREFIX}:${scope.userId}:${scope.shopId}`;
}

function offlineMutationRunLockName(
  scope: OfflineMutationScope,
  clientMutationId: string,
): string {
  return `${MUTATION_RUN_LOCK_PREFIX}:${scope.userId}:${scope.shopId}:${clientMutationId}`;
}

async function withOfflineMutationScopeLock<T>(
  scope: OfflineMutationScope,
  unavailableMessage: string,
  callback: () => Promise<T>,
): Promise<T> {
  const lockManager = getOfflineReplayLockManager();
  if (!lockManager) throw new Error(unavailableMessage);
  return lockManager.request(offlineReplayLockName(scope), callback);
}

async function withOfflineReplayRunLock<T>(
  scope: OfflineMutationScope,
  unavailableMessage: string,
  callback: () => Promise<T>,
): Promise<T> {
  const lockManager = getOfflineReplayLockManager();
  if (!lockManager) throw new Error(unavailableMessage);
  return lockManager.request(offlineReplayRunLockName(scope), callback);
}

async function withOfflineMutationRunLock<T>(
  scope: OfflineMutationScope,
  clientMutationId: string,
  unavailableMessage: string,
  callback: () => Promise<T>,
): Promise<T> {
  const lockManager = getOfflineReplayLockManager();
  if (!lockManager) throw new Error(unavailableMessage);
  return lockManager.request(
    offlineMutationRunLockName(scope, clientMutationId),
    callback,
  );
}

function withOfflineStateLock<T>(
  callback: (lock: OfflineDatabaseWriteLock) => Promise<T>,
): Promise<T> {
  return withOfflineDatabaseWriteLock(callback);
}

function withOfflineStateAndScopeLock<T>(
  scope: OfflineMutationScope,
  unavailableMessage: string,
  callback: (lock: OfflineDatabaseWriteLock) => Promise<T>,
): Promise<T> {
  return withOfflineStateLock((lock) =>
    withOfflineMutationScopeLock(scope, unavailableMessage, () =>
      callback(lock),
    ),
  );
}

function getQueueChannel(): BroadcastChannel | null {
  if (queueChannel || typeof BroadcastChannel === "undefined") {
    return queueChannel;
  }
  try {
    queueChannel = new BroadcastChannel(QUEUE_CHANNEL_NAME);
    return queueChannel;
  } catch {
    return null;
  }
}

function emitQueueUpdate(options?: { crossTab?: boolean }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
  if (!options?.crossTab) return;
  try {
    localStorage.setItem(
      QUEUE_REVISION_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // BroadcastChannel remains available when localStorage is blocked.
  }
  try {
    getQueueChannel()?.postMessage({ type: "queue-changed" });
  } catch {
    // The storage event remains available when BroadcastChannel is blocked.
  }
}

function isAttachmentMutation(mutation: Pick<PendingMutation, "actionType">) {
  return (
    mutation.actionType === "upload_job_photo" ||
    mutation.actionType === "inspection:upload-photo"
  );
}

function updatePersistenceMarker(queue: PendingMutation[]): void {
  if (!browserReady()) return;
  const scope = getOfflineMutationScope();
  if (!scope) return;
  const pending = queue.filter(
    (item) => item.status !== "synced" && scopeMatches(item, scope),
  );
  const marker: OfflinePersistenceMarker = {
    userId: scope.userId,
    shopId: scope.shopId,
    pendingMutations: pending.length,
    pendingAttachments: pending.filter(isAttachmentMutation).length,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(PERSISTENCE_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // IndexedDB remains authoritative when localStorage is unavailable.
  }
}

function readPersistenceMarker(): OfflinePersistenceMarker | null {
  if (!browserReady()) return null;
  try {
    const value = JSON.parse(
      localStorage.getItem(PERSISTENCE_MARKER_KEY) ?? "null",
    ) as Partial<OfflinePersistenceMarker> | null;
    const userId = clean(value?.userId);
    const shopId = clean(value?.shopId);
    return userId && shopId
      ? {
          userId,
          shopId,
          pendingMutations: Math.max(0, Number(value?.pendingMutations) || 0),
          pendingAttachments: Math.max(
            0,
            Number(value?.pendingAttachments) || 0,
          ),
          updatedAt: clean(value?.updatedAt),
        }
      : null;
  } catch {
    return null;
  }
}

export function setOfflineMutationScope(
  scope: OfflineMutationScope | null,
): void {
  if (!browserReady()) return;
  const previous = getOfflineMutationScope();
  const next =
    scope?.userId.trim() && scope.shopId.trim()
      ? { userId: scope.userId.trim(), shopId: scope.shopId.trim() }
      : null;
  if (previous?.userId !== next?.userId || previous?.shopId !== next?.shopId) {
    advanceQueueWriteEpoch();
  }
  try {
    if (!next) {
      localStorage.removeItem(SCOPE_KEY);
    } else {
      localStorage.setItem(SCOPE_KEY, JSON.stringify(next));
    }
  } catch {
    // Scope persistence is best-effort; verified online access remains usable.
    return;
  }
  emitQueueUpdate();
}

export function getOfflineMutationScope(): OfflineMutationScope | null {
  if (!browserReady()) return null;
  try {
    const value = JSON.parse(
      localStorage.getItem(SCOPE_KEY) ?? "null",
    ) as Partial<OfflineMutationScope> | null;
    const userId = clean(value?.userId);
    const shopId = clean(value?.shopId);
    return userId && shopId ? { userId, shopId } : null;
  } catch {
    return null;
  }
}

/**
 * Offline records are intentionally retained across sessions, but they must
 * never be rendered for whichever account happens to sign in next. The local
 * Supabase session must match first; while online, the canonical actor endpoint
 * also verifies the Shop before any saved state is returned. Replay retains its
 * separate under-lock server authorization checks.
 */
export async function getSessionMatchedOfflineScope(
  candidate: OfflineMutationScope | null = getOfflineMutationScope(),
): Promise<OfflineMutationScope | null> {
  const scope = candidate;
  if (!scope) return null;

  try {
    const {
      data: { session },
    } = await createBrowserSupabase().auth.getSession();
    const currentUserId = session?.user.id?.trim() ?? "";
    if (!currentUserId || currentUserId !== scope.userId) return null;
    if (typeof navigator === "undefined" || !navigator.onLine) return scope;

    const verification = await checkOfflineReplaySession(scope);
    return verification.status === "verified" ? scope : null;
  } catch {
    return null;
  }
}

function scopeMatches(
  mutation: Pick<PendingMutation, "userId" | "shopId">,
  scope: OfflineMutationScope | null,
): boolean {
  return Boolean(
    scope &&
    mutation.userId === scope.userId &&
    mutation.shopId === scope.shopId,
  );
}

export async function resolveOfflineMutationScope(
  payload: unknown,
  supplied?: OfflineMutationScope | null,
): Promise<OfflineMutationScope | null> {
  const resolutionEpoch = captureQueueWriteEpoch();
  const cached = getOfflineMutationScope();
  if (supplied?.userId.trim() && supplied.shopId.trim()) {
    const scope = {
      userId: supplied.userId.trim(),
      shopId: supplied.shopId.trim(),
    };
    if (scopeMatches(scope, cached)) return cached;

    // A component-held scope can outlive SIGNED_OUT. Never let that stale
    // value recreate the cleared global scope without matching the current
    // authenticated session (and, while online, its canonical Shop).
    const sessionMatched = await getSessionMatchedOfflineScope(scope);
    if (!sessionMatched || !queueWriteEpochMatches(resolutionEpoch)) {
      return null;
    }
    setOfflineMutationScope(scope);
    return scope;
  }

  const candidate = (
    payload && typeof payload === "object" ? payload : {}
  ) as ScopePayload;
  const explicitUserId = clean(candidate.userId) || clean(candidate.user_id);
  const explicitShopId = clean(candidate.shopId) || clean(candidate.shop_id);

  if (cached && (!explicitUserId || explicitUserId === cached.userId)) {
    if (!explicitShopId || explicitShopId === cached.shopId) return cached;
  }

  const supabase = createBrowserSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = explicitUserId || sessionData.session?.user.id || "";
  if (!userId) return null;

  let shopId = explicitShopId;
  const workOrderLineId =
    clean(candidate.workOrderLineId) ||
    clean(candidate.lineId) ||
    clean(candidate.work_order_line_id);
  const workOrderId =
    clean(candidate.workOrderId) || clean(candidate.work_order_id);

  if (!shopId && workOrderLineId && navigator.onLine) {
    const { data } = await supabase
      .from("work_order_lines")
      .select("shop_id")
      .eq("id", workOrderLineId)
      .maybeSingle<{ shop_id: string | null }>();
    shopId = clean(data?.shop_id);
  }
  if (!shopId && workOrderId && navigator.onLine) {
    const { data } = await supabase
      .from("work_orders")
      .select("shop_id")
      .eq("id", workOrderId)
      .maybeSingle<{ shop_id: string | null }>();
    shopId = clean(data?.shop_id);
  }
  if (!shopId && navigator.onLine) {
    const { data } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", userId)
      .maybeSingle<{ shop_id: string | null }>();
    shopId = clean(data?.shop_id);
  }

  if (!shopId) return null;
  const scope = { userId, shopId };
  if (!queueWriteEpochMatches(resolutionEpoch)) return null;
  setOfflineMutationScope(scope);
  return scope;
}

export function restoreOfflineMutation(raw: unknown): PendingMutation | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PendingMutation> & {
    id?: unknown;
    action?: unknown;
  };
  const clientMutationId = clean(item.clientMutationId) || clean(item.id);
  const actionType = clean(item.actionType) || clean(item.action);
  const createdAt = clean(item.createdAt);
  if (!clientMutationId || !actionType || !createdAt) return null;

  const userId = clean(item.userId);
  const shopId = clean(item.shopId);
  const validStatus = [
    "queued",
    "syncing",
    "failed",
    "synced",
    "conflicted",
  ].includes(String(item.status));
  const parsedStatus = (
    validStatus ? item.status : "queued"
  ) as OfflineMutationStatus;
  const status = parsedStatus;
  const missingScope = !userId || !shopId;

  return {
    clientMutationId,
    actionType,
    payload: item.payload,
    createdAt,
    retryCount: typeof item.retryCount === "number" ? item.retryCount : 0,
    userId,
    shopId,
    dependsOn: Array.isArray(item.dependsOn)
      ? item.dependsOn.map(String)
      : undefined,
    orderKey: clean(item.orderKey) || undefined,
    status: missingScope && status !== "synced" ? "conflicted" : status,
    lastError: clean(item.lastError) || undefined,
    conflictReason: missingScope
      ? "Legacy offline mutation has no authenticated user/shop scope. Re-enter the action."
      : clean(item.conflictReason) || undefined,
    syncedAt: clean(item.syncedAt) || undefined,
  };
}

function readLegacyOfflineMutations(): PendingMutation[] {
  if (!browserReady()) return [];
  const legacy: PendingMutation[] = [];
  for (const key of LEGACY_KEYS) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
      if (!Array.isArray(raw)) continue;
      legacy.push(
        ...raw
          .map((item) => restoreOfflineMutation(item))
          .filter((item): item is PendingMutation => Boolean(item)),
      );
    } catch {
      // Malformed legacy rows are ignored, but the storage key is not removed
      // until durable migration or an explicit unconditional clear succeeds.
    }
  }
  return legacy;
}

function removeLegacyOfflineMutationKeys(): void {
  if (!browserReady()) return;
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

export function normalizeOfflineMutationQueue(
  queue: PendingMutation[],
): PendingMutation[] {
  const byId = new Map<string, PendingMutation>();
  for (const item of queue) byId.set(item.clientMutationId, item);
  const deduped = [...byId.values()];
  const requiredIds = collectRequiredOfflineMutationIds(deduped);
  const now = Date.now();
  const retained = deduped.filter((item) => {
    if (requiredIds.has(item.clientMutationId)) return true;
    if (item.status !== "synced") return true;
    return Boolean(
      item.syncedAt &&
      now - new Date(item.syncedAt).getTime() < TERMINAL_RETENTION_MS,
    );
  });
  const syncedHistory = retained.filter(
    (item) =>
      item.status === "synced" && !requiredIds.has(item.clientMutationId),
  );
  if (syncedHistory.length <= MAX_HISTORY) return retained;
  const retainedSyncedHistoryIds = new Set(
    syncedHistory
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .slice(syncedHistory.length - MAX_HISTORY)
      .map((item) => item.clientMutationId),
  );
  return retained.filter(
    (item) =>
      item.status !== "synced" ||
      requiredIds.has(item.clientMutationId) ||
      retainedSyncedHistoryIds.has(item.clientMutationId),
  );
}

function restoreStoredQueue(rows: StoredOfflineMutation[]): PendingMutation[] {
  return rows
    .map(restoreOfflineMutation)
    .filter((item): item is PendingMutation => Boolean(item));
}

function droppedSyncedMutationIds(
  source: PendingMutation[],
  normalized: PendingMutation[],
): string[] {
  const retainedIds = new Set(normalized.map((item) => item.clientMutationId));
  return source
    .filter(
      (item) =>
        item.status === "synced" && !retainedIds.has(item.clientMutationId),
    )
    .map((item) => item.clientMutationId);
}

async function loadStoredQueue(
  lock?: OfflineDatabaseWriteLock,
): Promise<PendingMutation[]> {
  if (!offlineMutationStorageAvailable()) return queueCache;
  const restored = restoreStoredQueue(await readStoredMutations());
  const normalized = normalizeOfflineMutationQueue(restored);
  const droppedIds = droppedSyncedMutationIds(restored, normalized);
  if (droppedIds.length === 0) return normalized;

  try {
    await deleteSyncedStoredMutations({ clientMutationIds: droppedIds }, lock);
    return normalizeOfflineMutationQueue(
      restoreStoredQueue(await readStoredMutations()),
    );
  } catch {
    // History cleanup is best-effort. A terminal-row deletion failure must not
    // turn a successfully persisted pending command into an apparent failure.
    return normalized;
  }
}

async function refreshQueueCacheFromStorage(
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  if (!offlineMutationStorageAvailable()) return;
  const generation = ++storageRefreshRequestGeneration;
  const stored = await loadStoredQueue(lock);
  // A newer refresh supersedes this snapshot only after the newer read has
  // succeeded. If that read fails, retain this successful committed view.
  if (generation >= storageRefreshAppliedGeneration) {
    queueCache = stored;
    storageRefreshAppliedGeneration = generation;
  }
}

function installCrossTabQueueListeners(): void {
  if (crossTabListenersInstalled || typeof window === "undefined") return;
  crossTabListenersInstalled = true;

  const refreshFromStorage = () => {
    void refreshQueueCacheFromStorage()
      .then(() => {
        updatePersistenceMarker(queueCache);
        emitQueueUpdate();
      })
      .catch(() => undefined);
  };
  const channel = getQueueChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message =
        event.data && typeof event.data === "object"
          ? (event.data as { type?: unknown })
          : null;
      if (message?.type === "queue-changed") refreshFromStorage();
    };
  }
  window.addEventListener("storage", (event) => {
    if (event.key === QUEUE_REVISION_KEY) refreshFromStorage();
    else if (event.key === SCOPE_KEY) emitQueueUpdate();
  });
  window.addEventListener("focus", refreshFromStorage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshFromStorage();
  });
}

export async function hydrateOfflineMutationQueue(): Promise<void> {
  if (!browserReady()) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = withOfflineStateLock(async (lock) => {
    const stored = restoreStoredQueue(await readStoredMutations());
    const legacy = readLegacyOfflineMutations();
    const storedIds = new Set(stored.map((item) => item.clientMutationId));
    const legacyToPersist = normalizeOfflineMutationQueue(legacy).filter(
      (item) => !storedIds.has(item.clientMutationId),
    );
    const combined = [...stored, ...legacyToPersist];
    queueCache = normalizeOfflineMutationQueue(combined);
    const persisted = await insertStoredMutationsIfMissing(
      legacyToPersist,
      lock,
    );
    await deleteSyncedStoredMutations(
      {
        clientMutationIds: droppedSyncedMutationIds(combined, queueCache),
      },
      lock,
    );
    if (persisted) {
      await refreshQueueCacheFromStorage(lock);
      removeLegacyOfflineMutationKeys();
    }
    emitQueueUpdate();
  }).catch((error) => {
    hydrationPromise = null;
    console.warn("[offline] Unable to hydrate mutation queue", error);
  });
  return hydrationPromise;
}

export async function getOfflinePersistenceHealth(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): Promise<OfflinePersistenceHealth> {
  await hydrateOfflineMutationQueue();
  const storedPendingMutations = scope
    ? queueCache.filter(
        (item) => item.status !== "synced" && scopeMatches(item, scope),
      ).length
    : 0;
  const marker = readPersistenceMarker();
  const matches = Boolean(
    scope &&
    marker &&
    marker.userId === scope.userId &&
    marker.shopId === scope.shopId,
  );
  const expectedPendingMutations = matches ? marker!.pendingMutations : 0;
  const expectedPendingAttachments = matches ? marker!.pendingAttachments : 0;
  return {
    expectedPendingMutations,
    storedPendingMutations,
    expectedPendingAttachments,
    suspectedEviction:
      expectedPendingMutations > 0 && storedPendingMutations === 0,
  };
}

async function auditOfflineMutationAttachmentsWhileLocked(
  scope: OfflineMutationScope,
  lock: OfflineDatabaseWriteLock,
): Promise<OfflineAttachmentAudit> {
  const attachments = queueCache.filter(
    (item) =>
      item.status !== "synced" &&
      scopeMatches(item, scope) &&
      isAttachmentMutation(item),
  );
  let missing = 0;
  let invalid = 0;
  for (const mutation of attachments) {
    const payload = mutation.payload as { blobId?: unknown } | null;
    const blobId = clean(payload?.blobId);
    const record = blobId ? await getOfflineBlob(blobId) : null;
    const scopeMismatch = Boolean(
      record &&
      (record.userId !== mutation.userId || record.shopId !== mutation.shopId),
    );
    const invalidBlob = Boolean(
      record &&
      (!record.blob ||
        typeof record.blob.size !== "number" ||
        record.blob.size <= 0),
    );
    const reason = !blobId
      ? "The staged file reference is missing. Capture the photo again, then remove this update."
      : !record
        ? "Browser storage removed the staged photo. Capture it again, then remove this update."
        : scopeMismatch
          ? "The staged photo belongs to a different user or shop and cannot be uploaded."
          : invalidBlob
            ? "The staged photo is empty or corrupted. Capture it again, then remove this update."
            : null;
    if (!reason) continue;
    if (!record) missing += 1;
    else invalid += 1;
    if (
      mutation.status !== "conflicted" ||
      mutation.conflictReason !== reason
    ) {
      await markMutationStatus(
        {
          clientMutationId: mutation.clientMutationId,
          status: "conflicted",
          conflictReason: reason,
        },
        lock,
      );
    }
  }
  return { checked: attachments.length, missing, invalid };
}

export async function auditOfflineMutationAttachments(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): Promise<OfflineAttachmentAudit> {
  await hydrateOfflineMutationQueue();
  if (!scope) return { checked: 0, missing: 0, invalid: 0 };
  return withOfflineStateAndScopeLock(
    scope,
    "Safe cross-tab offline attachment checks are unavailable in this browser.",
    async (lock) => {
      if (!offlineMutationStorageAvailable()) {
        throw new Error(
          "Durable offline storage is unavailable; staged files were not changed.",
        );
      }
      await refreshQueueCacheFromStorage(lock);
      return auditOfflineMutationAttachmentsWhileLocked(scope, lock);
    },
  );
}

export function sortOfflineMutationsForReplay(
  queue: PendingMutation[],
): PendingMutation[] {
  return [...queue].sort((a, b) => {
    const time =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (time) return time;
    const order = (a.orderKey ?? "").localeCompare(b.orderKey ?? "");
    return order || a.clientMutationId.localeCompare(b.clientMutationId);
  });
}

async function upsertMutation(
  next: PendingMutation,
  lock: OfflineDatabaseWriteLock,
): Promise<void> {
  const localQueue = [...queueCache];
  const localIndex = localQueue.findIndex(
    (item) => item.clientMutationId === next.clientMutationId,
  );
  if (localIndex >= 0) localQueue[localIndex] = next;
  else localQueue.push(next);
  const localNormalized = normalizeOfflineMutationQueue(localQueue);
  const persisted = await upsertStoredMutations([next], lock);
  if (persisted) {
    try {
      await refreshQueueCacheFromStorage(lock);
    } catch {
      queueCache = localNormalized;
    }
  } else {
    queueCache = localNormalized;
  }
  updatePersistenceMarker(queueCache);
  emitQueueUpdate({ crossTab: true });
}

type EnqueueMutationEntry<T> = Omit<
  PendingMutation<T>,
  "createdAt" | "retryCount" | "status"
> & {
  status?: OfflineMutationStatus;
};

async function enqueueMutationAtEpoch<T>(
  entry: EnqueueMutationEntry<T>,
  expectedEpoch: QueueWriteEpoch,
): Promise<PendingMutation<T>> {
  if (!entry.userId.trim() || !entry.shopId.trim()) {
    throw new Error("Offline mutation scope requires userId and shopId.");
  }
  const scope = {
    userId: entry.userId.trim(),
    shopId: entry.shopId.trim(),
  };
  return withOfflineStateAndScopeLock(
    scope,
    "Safe cross-tab offline queue updates are unavailable in this browser.",
    async (lock) => {
      assertQueueWriteEpoch(expectedEpoch, scope);
      if (!offlineMutationStorageAvailable()) {
        throw new Error(
          "Durable offline storage is unavailable; saved work was not queued.",
        );
      }
      await refreshQueueCacheFromStorage(lock);
      assertQueueWriteEpoch(expectedEpoch, scope);
      const existing = queueCache.find(
        (item) => item.clientMutationId === entry.clientMutationId,
      );
      // A replay handler owns its exact row until settlement. Allow unrelated
      // queue writes to proceed, but never replace the payload currently being
      // submitted under the same idempotency key.
      if (existing?.status === "syncing") {
        return existing as PendingMutation<T>;
      }
      const committedAt = new Date().toISOString();
      const status = entry.status ?? "queued";
      const next: PendingMutation<T> = {
        ...entry,
        userId: scope.userId,
        shopId: scope.shopId,
        createdAt: existing?.createdAt ?? committedAt,
        retryCount: existing?.retryCount ?? 0,
        status,
        lastError: entry.lastError ?? existing?.lastError,
        conflictReason: entry.conflictReason ?? existing?.conflictReason,
        syncedAt:
          status === "synced"
            ? (entry.syncedAt ?? existing?.syncedAt ?? committedAt)
            : (entry.syncedAt ?? existing?.syncedAt),
      };
      await upsertMutation(next, lock);
      return next;
    },
  );
}

export async function enqueueMutation<T>(
  entry: EnqueueMutationEntry<T>,
): Promise<PendingMutation<T>> {
  await hydrateOfflineMutationQueue();
  return enqueueMutationAtEpoch(entry, captureQueueWriteEpoch());
}

async function markMutationStatus(
  args: {
    clientMutationId: string;
    status: OfflineMutationStatus;
    error?: string;
    conflictReason?: string;
    incrementRetry?: boolean;
  },
  lock: OfflineDatabaseWriteLock,
): Promise<boolean> {
  await refreshQueueCacheFromStorage(lock);
  const existing = queueCache.find(
    (item) => item.clientMutationId === args.clientMutationId,
  );
  if (!existing) return false;
  await upsertMutation(
    {
      ...existing,
      retryCount: args.incrementRetry
        ? existing.retryCount + 1
        : existing.retryCount,
      status: args.status,
      lastError: args.error,
      conflictReason: args.conflictReason,
      syncedAt:
        args.status === "synced" ? new Date().toISOString() : existing.syncedAt,
    },
    lock,
  );
  return true;
}

export function listPendingMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): PendingMutation[] {
  void hydrateOfflineMutationQueue();
  return queueCache.filter(
    (item) => item.status !== "synced" && scopeMatches(item, scope),
  );
}

export function listOfflineMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): PendingMutation[] {
  void hydrateOfflineMutationQueue();
  return sortOfflineMutationsForReplay(
    queueCache.filter((item) => scopeMatches(item, scope)),
  );
}

export function getOfflineSyncSummary(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
) {
  void hydrateOfflineMutationQueue();
  const summary = {
    queued: 0,
    syncing: 0,
    failed: 0,
    conflicted: 0,
    synced: 0,
    total: 0,
  };
  for (const item of queueCache.filter((entry) => scopeMatches(entry, scope))) {
    summary[item.status] += 1;
    summary.total += 1;
  }
  return summary;
}

export function subscribeOfflineMutations(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  installCrossTabQueueListeners();
  void hydrateOfflineMutationQueue();
  window.addEventListener(EVENT_NAME, listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
  };
}

export async function retryOfflineMutation(
  clientMutationId: string,
  payloadPatch?: Record<string, unknown>,
): Promise<void> {
  await hydrateOfflineMutationQueue();
  const scope = getOfflineMutationScope();
  if (!scope) return;
  const expectedEpoch = captureQueueWriteEpoch();
  await withOfflineStateAndScopeLock(
    scope,
    "Safe cross-tab offline retry is unavailable in this browser.",
    async (lock) => {
      assertQueueWriteEpoch(expectedEpoch, scope);
      if (!offlineMutationStorageAvailable()) {
        throw new Error(
          "Durable offline storage is unavailable; saved work was not retried.",
        );
      }
      await refreshQueueCacheFromStorage(lock);
      assertQueueWriteEpoch(expectedEpoch, scope);
      const mutation = queueCache.find(
        (item) =>
          item.clientMutationId === clientMutationId &&
          scopeMatches(item, scope),
      );
      if (
        !mutation ||
        mutation.status === "syncing" ||
        mutation.status === "synced"
      ) {
        return;
      }
      await upsertMutation(
        {
          ...mutation,
          payload:
            payloadPatch &&
            mutation.payload &&
            typeof mutation.payload === "object"
              ? {
                  ...(mutation.payload as Record<string, unknown>),
                  ...payloadPatch,
                }
              : mutation.payload,
          status: "queued",
          lastError: undefined,
          conflictReason: undefined,
        },
        lock,
      );
    },
  );
}

export async function dismissOfflineMutation(
  clientMutationId: string,
): Promise<void> {
  await hydrateOfflineMutationQueue();
  const scope = getOfflineMutationScope();
  if (!scope) return;
  const expectedEpoch = captureQueueWriteEpoch();
  await withOfflineStateAndScopeLock(
    scope,
    "Safe cross-tab offline removal is unavailable in this browser.",
    async (lock) => {
      assertQueueWriteEpoch(expectedEpoch, scope);
      if (!offlineMutationStorageAvailable()) {
        throw new Error(
          "Durable offline storage is unavailable; saved work was not removed.",
        );
      }
      await refreshQueueCacheFromStorage(lock);
      assertQueueWriteEpoch(expectedEpoch, scope);
      const mutation = queueCache.find(
        (item) =>
          item.clientMutationId === clientMutationId &&
          scopeMatches(item, scope),
      );
      if (!mutation || mutation.status === "syncing") return;
      const dependent = queueCache.find(
        (item) =>
          scopeMatches(item, scope) &&
          item.status !== "synced" &&
          item.dependsOn?.includes(clientMutationId),
      );
      if (dependent) {
        throw new Error("Remove the dependent offline update first.");
      }
      const persisted = await deleteStoredMutations([clientMutationId], lock);
      if (!persisted) {
        throw new Error(
          "Durable offline storage is unavailable; saved work was not removed.",
        );
      }
      try {
        await refreshQueueCacheFromStorage(lock);
      } catch {
        queueCache = queueCache.filter(
          (item) => item.clientMutationId !== clientMutationId,
        );
      }
      if (
        mutation.actionType === "upload_job_photo" ||
        mutation.actionType === "inspection:upload-photo"
      ) {
        const payload = mutation.payload as { blobId?: unknown } | null;
        if (typeof payload?.blobId === "string") {
          await removeOfflineBlob(payload.blobId, lock);
        }
      }
      updatePersistenceMarker(queueCache);
      emitQueueUpdate({ crossTab: true });
    },
  );
}

function removeDisposableSyncedFromQueueCache(
  scope: OfflineMutationScope | null,
): void {
  const requiredIds = collectRequiredOfflineMutationIds(queueCache);
  queueCache = queueCache.filter(
    (item) =>
      item.status !== "synced" ||
      requiredIds.has(item.clientMutationId) ||
      !scopeMatches(item, scope),
  );
}

export async function clearSyncedOfflineMutations(): Promise<void> {
  await hydrateOfflineMutationQueue();
  await withOfflineStateLock(async (lock) => {
    await refreshQueueCacheFromStorage(lock);
    const scope = getOfflineMutationScope();
    const removed = await deleteSyncedStoredMutations(
      {
        scope: scope ?? undefined,
      },
      lock,
    );
    if (removed !== null) {
      try {
        await refreshQueueCacheFromStorage(lock);
      } catch {
        removeDisposableSyncedFromQueueCache(scope);
      }
    } else {
      removeDisposableSyncedFromQueueCache(scope);
    }
    updatePersistenceMarker(queueCache);
    emitQueueUpdate({ crossTab: true });
  });
}

export async function pruneOfflineState(): Promise<{
  mutationsRemoved: number;
  snapshotsRemoved: number;
  blobsRemoved: number;
}> {
  await hydrateOfflineMutationQueue();
  const scope = getOfflineMutationScope();
  if (!scope)
    return { mutationsRemoved: 0, snapshotsRemoved: 0, blobsRemoved: 0 };
  const before = queueCache.length;
  const retainedBlobIds = new Set(
    queueCache
      .filter(
        (item) =>
          scopeMatches(item, scope) &&
          (item.actionType === "upload_job_photo" ||
            item.actionType === "inspection:upload-photo") &&
          item.status !== "synced",
      )
      .map((item) => (item.payload as { blobId?: unknown } | null)?.blobId)
      .filter((id): id is string => typeof id === "string"),
  );
  await clearSyncedOfflineMutations();
  const removed = await pruneOfflineDatabase({ scope, retainedBlobIds });
  return {
    mutationsRemoved: before - queueCache.length,
    snapshotsRemoved: removed.snapshotsRemoved,
    blobsRemoved: removed.blobsRemoved,
  };
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const source = error as ErrorLike;
  const value = source.status ?? source.statusCode;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRetryableOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const status = statusCode(error);
  if (status != null) {
    if (PERMANENT_STATUS_CODES.has(status)) return false;
    if (isRetryableOfflineStatus(status)) return true;
  }
  const source = (error && typeof error === "object" ? error : {}) as ErrorLike;
  const code = clean(source.code).toUpperCase();
  if (["PGRST301", "42501", "23503", "23505", "22P02"].includes(code))
    return false;
  const message = clean(source.message ?? error).toLowerCase();
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

export function isRetryableOfflineStatus(status: unknown): boolean {
  const parsed = typeof status === "number" ? status : Number(status);
  return Number.isFinite(parsed) && RETRYABLE_STATUS_CODES.has(parsed);
}

async function recoverInterruptedMutationScopeWhileReplayLocked(
  scope: OfflineMutationScope,
  expectedEpoch: QueueWriteEpoch,
): Promise<number> {
  return withOfflineStateAndScopeLock(
    scope,
    "Safe cross-tab offline replay is unavailable in this browser.",
    async (lock) => {
      if (
        !queueWriteEpochMatches(expectedEpoch) ||
        !scopeMatches(scope, getOfflineMutationScope())
      ) {
        return 0;
      }
      const recovered = await recoverInterruptedStoredMutations(scope, lock);
      if (recovered === null) {
        throw new Error(
          "Durable offline storage is unavailable; saved work was not replayed.",
        );
      }
      await refreshQueueCacheFromStorage(lock);
      updatePersistenceMarker(queueCache);
      if (recovered > 0) emitQueueUpdate({ crossTab: true });
      return recovered;
    },
  );
}

async function findNextMutationForReplay(args: {
  scope: OfflineMutationScope;
  expectedEpoch: QueueWriteEpoch;
  attempted: Set<string>;
}): Promise<string | null> {
  return withOfflineStateAndScopeLock(
    args.scope,
    "Safe cross-tab offline replay is unavailable in this browser.",
    async (lock) => {
      if (
        !queueWriteEpochMatches(args.expectedEpoch) ||
        !scopeMatches(args.scope, getOfflineMutationScope())
      ) {
        return null;
      }
      await refreshQueueCacheFromStorage(lock);
      const candidates = sortOfflineMutationsForReplay(
        queueCache.filter(
          (item) =>
            ["queued", "failed"].includes(item.status) &&
            scopeMatches(item, args.scope) &&
            !args.attempted.has(item.clientMutationId),
        ),
      );

      for (const mutation of candidates) {
        const dependencyPending =
          mutation.dependsOn?.some(
            (id) =>
              queueCache.find(
                (item) =>
                  item.clientMutationId === id &&
                  scopeMatches(item, args.scope),
              )?.status !== "synced",
          ) ?? false;
        if (dependencyPending) continue;
        args.attempted.add(mutation.clientMutationId);
        return mutation.clientMutationId;
      }
      return null;
    },
  );
}

async function claimMutationForReplay(args: {
  scope: OfflineMutationScope;
  expectedEpoch: QueueWriteEpoch;
  clientMutationId: string;
}): Promise<PendingMutation | null> {
  return withOfflineStateAndScopeLock(
    args.scope,
    "Safe cross-tab offline replay is unavailable in this browser.",
    async (lock) => {
      if (
        !queueWriteEpochMatches(args.expectedEpoch) ||
        !scopeMatches(args.scope, getOfflineMutationScope())
      ) {
        return null;
      }
      const storedClaim = await claimStoredMutationForReplay(
        {
          clientMutationId: args.clientMutationId,
          scope: args.scope,
        },
        lock,
      );
      if (storedClaim === null) {
        throw new Error(
          "Durable offline storage is unavailable; saved work was not replayed.",
        );
      }
      if (!storedClaim) return null;
      const claimedMutation = restoreOfflineMutation(storedClaim);
      if (!claimedMutation || !scopeMatches(claimedMutation, args.scope)) {
        return null;
      }
      await refreshQueueCacheFromStorage(lock);
      updatePersistenceMarker(queueCache);
      emitQueueUpdate({ crossTab: true });
      return claimedMutation;
    },
  );
}

async function settleMutationReplay(args: {
  scope: OfflineMutationScope;
  expectedEpoch: QueueWriteEpoch;
  clientMutationId: string;
  status: OfflineMutationStatus;
  error?: string;
  conflictReason?: string;
  incrementRetry?: boolean;
}): Promise<boolean> {
  return withOfflineStateAndScopeLock(
    args.scope,
    "Safe cross-tab offline replay is unavailable in this browser.",
    async (lock) => {
      if (
        !queueWriteEpochMatches(args.expectedEpoch) ||
        !scopeMatches(args.scope, getOfflineMutationScope())
      ) {
        return false;
      }
      return markMutationStatus(
        {
          clientMutationId: args.clientMutationId,
          status: args.status,
          error: args.error,
          conflictReason: args.conflictReason,
          incrementRetry: args.incrementRetry,
        },
        lock,
      );
    },
  );
}

async function replayQueuedMutationsWhileReplayLocked(args: {
  handlers: Record<string, OfflineMutationRunner>;
  scope: OfflineMutationScope;
  expectedEpoch: QueueWriteEpoch;
}): Promise<OfflineReplayResult> {
  let replayed = 0;
  let failed = 0;
  let conflicted = 0;
  const attempted = new Set<string>();

  while (true) {
    const clientMutationId = await findNextMutationForReplay({
      scope: args.scope,
      expectedEpoch: args.expectedEpoch,
      attempted,
    });
    if (!clientMutationId) break;

    const outcome = await withOfflineMutationRunLock(
      args.scope,
      clientMutationId,
      "Safe cross-tab offline replay is unavailable in this browser.",
      async () => {
        const claimedMutation = await claimMutationForReplay({
          scope: args.scope,
          expectedEpoch: args.expectedEpoch,
          clientMutationId,
        });
        if (!claimedMutation) return emptyReplayResult();

        const handler = args.handlers[claimedMutation.actionType];
        if (!handler) {
          const settled = await settleMutationReplay({
            scope: args.scope,
            expectedEpoch: args.expectedEpoch,
            clientMutationId: claimedMutation.clientMutationId,
            status: "conflicted",
            conflictReason: `No replay handler registered for ${claimedMutation.actionType}`,
          });
          return {
            replayed: 0,
            failed: 0,
            conflicted: settled ? 1 : 0,
          };
        }
        try {
          const result = await handler(claimedMutation);
          if (result?.conflicted) {
            const settled = await settleMutationReplay({
              scope: args.scope,
              expectedEpoch: args.expectedEpoch,
              clientMutationId: claimedMutation.clientMutationId,
              status: "conflicted",
              conflictReason: result.conflicted,
              incrementRetry: true,
            });
            return {
              replayed: 0,
              failed: 0,
              conflicted: settled ? 1 : 0,
            };
          }
          const settled = await settleMutationReplay({
            scope: args.scope,
            expectedEpoch: args.expectedEpoch,
            clientMutationId: claimedMutation.clientMutationId,
            status: "synced",
          });
          return {
            replayed: settled ? 1 : 0,
            failed: 0,
            conflicted: 0,
          };
        } catch (error) {
          const retryable = isRetryableOfflineError(error);
          const settled = await settleMutationReplay({
            scope: args.scope,
            expectedEpoch: args.expectedEpoch,
            clientMutationId: claimedMutation.clientMutationId,
            status: retryable ? "failed" : "conflicted",
            error: error instanceof Error ? error.message : "Replay failed",
            conflictReason: retryable
              ? undefined
              : "Server rejected this update. Review it before retrying.",
            incrementRetry: true,
          });
          return {
            replayed: 0,
            failed: settled && retryable ? 1 : 0,
            conflicted: settled && !retryable ? 1 : 0,
          };
        }
      },
    );
    replayed += outcome.replayed;
    failed += outcome.failed;
    conflicted += outcome.conflicted;
  }
  return { replayed, failed, conflicted };
}

/**
 * Recover crash-interrupted rows during lifecycle startup even while offline.
 * The replay-only lock excludes another active handler without blocking normal
 * enqueues, while the shorter scope lock protects the durable status rewrite.
 */
export async function recoverInterruptedOfflineMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): Promise<number> {
  await hydrateOfflineMutationQueue();
  if (!scope) return 0;
  const expectedEpoch = captureQueueWriteEpoch();
  return withOfflineReplayRunLock(
    scope,
    "Safe cross-tab offline recovery is unavailable in this browser.",
    () =>
      recoverInterruptedMutationScopeWhileReplayLocked(scope, expectedEpoch),
  );
}

export async function replayQueuedMutations(args: {
  handlers: Record<string, OfflineMutationRunner>;
  scope?: OfflineMutationScope | null;
}): Promise<OfflineReplayResult> {
  await hydrateOfflineMutationQueue();
  await refreshQueueCacheFromStorage();
  const scope = args.scope ?? getOfflineMutationScope();
  if (!scope) return emptyReplayResult();

  const hasReplayWork = queueCache.some(
    (item) =>
      ["queued", "syncing", "failed"].includes(item.status) &&
      scopeMatches(item, scope),
  );
  if (!hasReplayWork) return emptyReplayResult();
  const expectedEpoch = captureQueueWriteEpoch();

  return withOfflineReplayRunLock(
    scope,
    "Safe cross-tab offline replay is unavailable in this browser.",
    async () => {
      await recoverInterruptedMutationScopeWhileReplayLocked(
        scope,
        expectedEpoch,
      );
      // Recovery is useful even while disconnected: a crash-interrupted item
      // must become retryable/removable instead of remaining stuck as syncing.
      // The handler still never runs until the browser is online.
      if (!navigator.onLine) return emptyReplayResult();
      await withOfflineStateAndScopeLock(
        scope,
        "Safe cross-tab offline replay is unavailable in this browser.",
        async (lock) => {
          if (!queueWriteEpochMatches(expectedEpoch)) return;
          await refreshQueueCacheFromStorage(lock);
          await auditOfflineMutationAttachmentsWhileLocked(scope, lock);
        },
      );
      return replayQueuedMutationsWhileReplayLocked({
        handlers: args.handlers,
        scope,
        expectedEpoch,
      });
    },
  );
}

export async function runMutationWithOfflineQueue<T>(args: {
  clientMutationId: string;
  actionType: string;
  payload: T;
  runner: () => Promise<void>;
  scope?: OfflineMutationScope | null;
  validateScope?: (scope: OfflineMutationScope) => boolean;
  queueOnOffline?: boolean;
  dependsOn?: string[];
  orderKey?: string;
  conflictCheck?: () => Promise<string | null>;
  bestEffortOnlineHistory?: boolean;
}): Promise<{ queued: boolean; conflicted: boolean }> {
  const requestEpoch = captureQueueWriteEpoch();
  await hydrateOfflineMutationQueue();
  if (!queueWriteEpochMatches(requestEpoch)) {
    throw new Error("Authenticated user or shop changed before this update.");
  }
  const queueOnOffline = args.queueOnOffline !== false;

  // A feature can bind a long-running command to its mounted auth/shop epoch.
  // Validate a supplied scope synchronously immediately before resolution so
  // a stale operation cannot replace a newer actor's global scope after an
  // IndexedDB hydration pause.
  if (args.scope) {
    const suppliedScope = {
      userId: args.scope.userId.trim(),
      shopId: args.scope.shopId.trim(),
    };
    if (args.validateScope && !args.validateScope(suppliedScope)) {
      throw new Error("Authenticated user or shop changed before this update.");
    }
  }
  const scope = await resolveOfflineMutationScope(args.payload, args.scope);
  if (!scope) {
    throw new Error(
      "Authenticated user and shop scope could not be resolved for offline sync.",
    );
  }
  if (args.validateScope && !args.validateScope(scope)) {
    throw new Error("Authenticated user or shop changed before this update.");
  }
  const expectedEpoch = captureQueueWriteEpoch();
  assertQueueWriteEpoch(expectedEpoch, scope);

  const queueEntry = (
    status: OfflineMutationStatus = "queued",
    details: Pick<PendingMutation, "conflictReason"> = {},
  ) =>
    enqueueMutationAtEpoch(
      {
        clientMutationId: args.clientMutationId,
        actionType: args.actionType,
        payload: args.payload,
        userId: scope.userId,
        shopId: scope.shopId,
        dependsOn: args.dependsOn,
        orderKey: args.orderKey,
        status,
        ...details,
      },
      expectedEpoch,
    );

  return withOfflineMutationRunLock(
    scope,
    args.clientMutationId,
    "Safe cross-tab offline mutation execution is unavailable in this browser.",
    async () => {
      assertQueueWriteEpoch(expectedEpoch, scope);
      try {
        await refreshQueueCacheFromStorage();
      } catch (error) {
        // A transient IndexedDB read failure must not prevent an independent
        // canonical online command from reaching the server. Dependency order,
        // however, may only be decided from the durable cross-tab queue.
        if (typeof navigator === "undefined" || !navigator.onLine) throw error;
        if (args.dependsOn?.length) {
          throw new Error(
            "Durable offline dependency state is unavailable; this update was not submitted.",
          );
        }
      }

      const existing = queueCache.find(
        (item) =>
          item.clientMutationId === args.clientMutationId &&
          scopeMatches(item, scope),
      );
      if (existing?.status === "synced") {
        return { queued: false, conflicted: false };
      }
      // The per-mutation execution lock excludes an active new-protocol
      // handler. A remaining syncing row is therefore crash-interrupted work;
      // lifecycle recovery will make it retryable without issuing a duplicate.
      if (existing?.status === "syncing") {
        return { queued: true, conflicted: false };
      }

      const dependencyPending =
        args.dependsOn?.some((id) => {
          const dependency = queueCache.find(
            (item) => item.clientMutationId === id && scopeMatches(item, scope),
          );
          return Boolean(dependency && dependency.status !== "synced");
        }) ?? false;

      // A dependent command cannot bypass an earlier queued command merely
      // because connectivity returned between taps.
      if (dependencyPending || (queueOnOffline && !navigator.onLine)) {
        if (args.validateScope && !args.validateScope(scope)) {
          throw new Error(
            "Authenticated user or shop changed before this update.",
          );
        }
        await queueEntry();
        return { queued: true, conflicted: false };
      }

      try {
        assertQueueWriteEpoch(expectedEpoch, scope);
        if (args.conflictCheck) {
          const conflict = await args.conflictCheck();
          if (conflict) {
            await queueEntry("conflicted", { conflictReason: conflict });
            return { queued: false, conflicted: true };
          }
        }
        if (args.validateScope && !args.validateScope(scope)) {
          throw new Error(
            "Authenticated user or shop changed before this update.");
        }
        assertQueueWriteEpoch(expectedEpoch, scope);
        await args.runner();
        if (args.bestEffortOnlineHistory) {
          try {
            await queueEntry("synced");
          } catch {
            // The server commit succeeded; unavailable device history must not
            // turn an online mutation into an apparent submission failure.
          }
        } else {
          await queueEntry("synced");
        }
        return { queued: false, conflicted: false };
      } catch (error) {
        if (queueOnOffline && isRetryableOfflineError(error)) {
          if (args.validateScope && !args.validateScope(scope)) throw error;
          await queueEntry();
          return { queued: true, conflicted: false };
        }
        throw error;
      }
    },
  );
}

export async function clearOfflineState(
  options: { preserveUnsyncedWork?: boolean } = {},
): Promise<{ retainedUnsyncedWork: boolean }> {
  const formerScope = getOfflineMutationScope();
  // Fence queue writers synchronously, before any await. Draft writers are
  // protected independently by the atomic IndexedDB cleanup below.
  advanceQueueWriteEpoch();
  storageRefreshAppliedGeneration = ++storageRefreshRequestGeneration;
  queueCache = [];
  hydrationPromise = null;
  setOfflineMutationScope(null);

  let retainUnsyncedWork = false;
  const clearDatabase = async (lock: OfflineDatabaseWriteLock) => {
    if (options.preserveUnsyncedWork === true) {
      // Legacy queues must become durable before localStorage can be cleared.
      // This closes the SIGNED_OUT-vs-hydration race and leaves recoverable
      // legacy rows untouched when IndexedDB is unavailable.
      const legacy = normalizeOfflineMutationQueue(readLegacyOfflineMutations());
      if (legacy.length > 0) {
        const stored = restoreStoredQueue(await readStoredMutations());
        const storedIds = new Set(stored.map((item) => item.clientMutationId));
        const legacyToPersist = legacy.filter(
          (item) => !storedIds.has(item.clientMutationId),
        );
        const legacyPersisted = await insertStoredMutationsIfMissing(
          legacyToPersist,
          lock,
        );
        if (!legacyPersisted) {
          if (legacy.some((item) => item.status !== "synced")) {
            retainUnsyncedWork = true;
            return;
          }
        } else {
          removeLegacyOfflineMutationKeys();
        }
      }

      // The helper decides whether anything survives and performs the matching
      // cleanup in one IndexedDB transaction. There is no pre-count window for
      // a cross-tab draft writer to fall into when Web Locks are unavailable.
      retainUnsyncedWork =
        await clearOfflineDatabasePreservingUnsyncedWork(lock);
      if (!retainUnsyncedWork) {
        localStorage.removeItem(PERSISTENCE_MARKER_KEY);
      }
      return;
    }
    await clearOfflineDatabase(lock);
    removeLegacyOfflineMutationKeys();
    localStorage.removeItem(PERSISTENCE_MARKER_KEY);
  };
  const lockManager = getOfflineReplayLockManager();
  await withOfflineStateLock(async (lock) => {
    if (formerScope && lockManager) {
      await lockManager.request(offlineReplayLockName(formerScope), () =>
        clearDatabase(lock),
      );
    } else {
      await clearDatabase(lock);
    }
    // Keep the final in-memory reset inside the same write lock. A newly
    // authenticated writer can only begin after both durable and cached state
    // from the former session have been cleared.
    storageRefreshAppliedGeneration = ++storageRefreshRequestGeneration;
    queueCache = [];
    emitQueueUpdate({ crossTab: true });
  });

  return { retainedUnsyncedWork: retainUnsyncedWork };
}
