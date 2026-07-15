"use client";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export type OfflineMutationStatus =
  | "queued"
  | "syncing"
  | "failed"
  | "synced"
  | "conflicted";

export type OfflineMutationScope = { userId: string; shopId: string };

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

const KEY = "profixiq.pending_mutations.v3";
const PREVIOUS_KEYS = ["profixiq.pending_mutations.v2", "profixiq.pending_mutations.v1"];
const SCOPE_KEY = "profixiq.pending_mutations.scope.v1";
const EVENT_NAME = "offline-mutations:updated";
const MAX_HISTORY = 300;
const TERMINAL_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 409, 410, 412, 422]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function browserReady(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emitQueueUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function setOfflineMutationScope(scope: OfflineMutationScope | null): void {
  if (!browserReady()) return;
  if (!scope?.userId.trim() || !scope.shopId.trim()) {
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
  if (!browserReady()) return null;
  try {
    const value = JSON.parse(localStorage.getItem(SCOPE_KEY) ?? "null") as
      | Partial<OfflineMutationScope>
      | null;
    const userId = clean(value?.userId);
    const shopId = clean(value?.shopId);
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

async function resolveMutationScope(
  payload: unknown,
  supplied?: OfflineMutationScope | null,
): Promise<OfflineMutationScope | null> {
  if (supplied?.userId.trim() && supplied.shopId.trim()) {
    const scope = { userId: supplied.userId.trim(), shopId: supplied.shopId.trim() };
    setOfflineMutationScope(scope);
    return scope;
  }

  const cached = getOfflineMutationScope();
  const candidate = (payload && typeof payload === "object" ? payload : {}) as ScopePayload;
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
  const workOrderId = clean(candidate.workOrderId) || clean(candidate.work_order_id);

  if (!shopId && workOrderLineId && typeof navigator !== "undefined" && navigator.onLine) {
    const { data } = await supabase
      .from("work_order_lines")
      .select("shop_id")
      .eq("id", workOrderLineId)
      .maybeSingle<{ shop_id: string | null }>();
    shopId = clean(data?.shop_id);
  }

  if (!shopId && workOrderId && typeof navigator !== "undefined" && navigator.onLine) {
    const { data } = await supabase
      .from("work_orders")
      .select("shop_id")
      .eq("id", workOrderId)
      .maybeSingle<{ shop_id: string | null }>();
    shopId = clean(data?.shop_id);
  }

  if (!shopId && typeof navigator !== "undefined" && navigator.onLine) {
    const { data } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", userId)
      .maybeSingle<{ shop_id: string | null }>();
    shopId = clean(data?.shop_id);
  }

  if (!shopId) return null;
  const scope = { userId, shopId };
  setOfflineMutationScope(scope);
  return scope;
}

function parseMutation(raw: unknown): PendingMutation | null {
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
  const validStatus = ["queued", "syncing", "failed", "synced", "conflicted"].includes(
    String(item.status),
  );
  const status = (validStatus ? item.status : "queued") as OfflineMutationStatus;
  const missingScope = !userId || !shopId;

  return {
    clientMutationId,
    actionType,
    payload: item.payload,
    createdAt,
    retryCount: typeof item.retryCount === "number" ? item.retryCount : 0,
    userId,
    shopId,
    dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map(String) : undefined,
    orderKey: clean(item.orderKey) || undefined,
    status: missingScope && status !== "synced" ? "conflicted" : status,
    lastError: clean(item.lastError) || undefined,
    conflictReason: missingScope
      ? "Legacy offline mutation has no authenticated user/shop scope. Re-enter the action."
      : clean(item.conflictReason) || undefined,
    syncedAt: clean(item.syncedAt) || undefined,
  };
}

function normalizeQueue(queue: PendingMutation[]): PendingMutation[] {
  const now = Date.now();
  const retained = queue.filter((item) => {
    if (item.status !== "synced") return true;
    return Boolean(
      item.syncedAt &&
        now - new Date(item.syncedAt).getTime() < TERMINAL_RETENTION_MS,
    );
  });
  if (retained.length <= MAX_HISTORY) return retained;
  return retained
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .slice(retained.length - MAX_HISTORY);
}

function readQueue(): PendingMutation[] {
  if (!browserReady()) return [];
  try {
    const currentRaw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    const current = Array.isArray(currentRaw)
      ? currentRaw.map(parseMutation).filter((item): item is PendingMutation => !!item)
      : [];
    const migrated: PendingMutation[] = [];
    for (const oldKey of PREVIOUS_KEYS) {
      const oldRaw = JSON.parse(localStorage.getItem(oldKey) ?? "[]") as unknown;
      if (Array.isArray(oldRaw)) {
        migrated.push(
          ...oldRaw.map(parseMutation).filter((item): item is PendingMutation => !!item),
        );
      }
      localStorage.removeItem(oldKey);
    }
    const combined = normalizeQueue([...current, ...migrated]);
    if (migrated.length) localStorage.setItem(KEY, JSON.stringify(combined));
    return combined;
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingMutation[]): void {
  if (!browserReady()) return;
  localStorage.setItem(KEY, JSON.stringify(normalizeQueue(queue)));
  emitQueueUpdate();
}

function sortForReplay(queue: PendingMutation[]): PendingMutation[] {
  return [...queue].sort((a, b) => {
    const time = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (time) return time;
    const order = (a.orderKey ?? "").localeCompare(b.orderKey ?? "");
    return order || a.clientMutationId.localeCompare(b.clientMutationId);
  });
}

function upsertMutation(next: PendingMutation): void {
  const queue = readQueue();
  const index = queue.findIndex((item) => item.clientMutationId === next.clientMutationId);
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
    ...entry,
    userId: entry.userId.trim(),
    shopId: entry.shopId.trim(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    retryCount: existing?.retryCount ?? 0,
    status: entry.status ?? "queued",
    lastError: existing?.lastError,
    conflictReason: existing?.conflictReason,
    syncedAt: existing?.syncedAt,
  };
  upsertMutation(next);
  return next;
}

export function getMutation(clientMutationId: string): PendingMutation | null {
  return readQueue().find((item) => item.clientMutationId === clientMutationId) ?? null;
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
    retryCount: args.incrementRetry ? existing.retryCount + 1 : existing.retryCount,
    status: args.status,
    lastError: args.error,
    conflictReason: args.conflictReason,
    syncedAt: args.status === "synced" ? new Date().toISOString() : existing.syncedAt,
  });
}

export function listPendingMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): PendingMutation[] {
  return readQueue().filter((item) => item.status !== "synced" && scopeMatches(item, scope));
}

export function listOfflineMutations(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
): PendingMutation[] {
  return sortForReplay(readQueue().filter((item) => scopeMatches(item, scope)));
}

export function getOfflineSyncSummary(
  scope: OfflineMutationScope | null = getOfflineMutationScope(),
) {
  const summary = { queued: 0, syncing: 0, failed: 0, conflicted: 0, synced: 0, total: 0 };
  for (const item of readQueue().filter((entry) => scopeMatches(entry, scope))) {
    summary[item.status] += 1;
    summary.total += 1;
  }
  return summary;
}

export function removeMutation(clientMutationId: string): void {
  writeQueue(readQueue().filter((item) => item.clientMutationId !== clientMutationId));
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
    if (RETRYABLE_STATUS_CODES.has(status)) return true;
  }
  const source = (error && typeof error === "object" ? error : {}) as ErrorLike;
  const code = clean(source.code).toUpperCase();
  if (["PGRST301", "42501", "23503", "23505", "22P02"].includes(code)) return false;
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

export async function replayQueuedMutations(args: {
  handlers: Record<string, OfflineMutationRunner>;
  scope?: OfflineMutationScope | null;
}): Promise<{ replayed: number; failed: number; conflicted: number }> {
  const scope = args.scope ?? getOfflineMutationScope();
  if (!scope) return { replayed: 0, failed: 0, conflicted: 0 };
  const queue = sortForReplay(
    readQueue().filter(
      (item) =>
        ["queued", "failed"].includes(item.status) && scopeMatches(item, scope),
    ),
  );
  let replayed = 0;
  let failed = 0;
  let conflicted = 0;

  for (const mutation of queue) {
    const dependencyPending =
      mutation.dependsOn?.some((id) => getMutation(id)?.status !== "synced") ?? false;
    if (dependencyPending) continue;
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
      } else {
        markMutationStatus({ clientMutationId: mutation.clientMutationId, status: "synced" });
        replayed += 1;
      }
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
  const scope = await resolveMutationScope(args.payload, args.scope);
  if (!scope) {
    throw new Error(
      "Authenticated user and shop scope could not be resolved for offline sync.",
    );
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
