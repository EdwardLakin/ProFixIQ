"use client";

import {
  getOfflineSnapshot,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  getOfflineMutationScope,
  setOfflineMutationScope,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

const KIND = "message-draft";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const SHELL_CACHE = "profixiq-messaging-shell-v1";

export type OfflineMessageDraft = {
  targetId: string;
  userId: string;
  shopId: string;
  content: string;
  subject?: string;
  contextKey?: string;
  audience?: "internal" | "customer";
  recipientIds?: string[];
  customerId?: string | null;
  useContext?: boolean;
  conversationRequestId: string;
  clientMessageId: string;
  updatedAt: string;
};

export function createMessageDraft(args: {
  scope: OfflineMutationScope;
  targetId: string;
  content?: string;
}): OfflineMessageDraft {
  return {
    targetId: args.targetId,
    userId: args.scope.userId,
    shopId: args.scope.shopId,
    content: args.content ?? "",
    conversationRequestId: crypto.randomUUID(),
    clientMessageId: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
}

export async function resolveMessagingDraftScope(
  expectedUserId?: string | null,
): Promise<OfflineMutationScope | null> {
  const cached = getOfflineMutationScope();
  if (cached && (!expectedUserId || cached.userId === expectedUserId)) return cached;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  try {
    const response = await fetch("/api/chat/offline-scope", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { userId?: string; shopId?: string };
    if (!body.userId || !body.shopId || (expectedUserId && body.userId !== expectedUserId)) {
      return null;
    }
    const scope = { userId: body.userId, shopId: body.shopId };
    setOfflineMutationScope(scope);
    return scope;
  } catch {
    return null;
  }
}

export async function getOfflineMessageDraft(args: {
  scope: OfflineMutationScope;
  targetId: string;
}): Promise<OfflineMessageDraft | null> {
  const stored = await getOfflineSnapshot<OfflineMessageDraft>({
    scope: args.scope,
    kind: KIND,
    entityId: args.targetId,
  });
  return stored?.data ?? null;
}

export async function saveOfflineMessageDraft(
  draft: OfflineMessageDraft,
): Promise<void> {
  await saveOfflineSnapshot({
    scope: { userId: draft.userId, shopId: draft.shopId },
    kind: KIND,
    entityId: draft.targetId,
    data: { ...draft, updatedAt: new Date().toISOString() },
    maxAgeMs: MAX_AGE_MS,
  });
}

export async function removeOfflineMessageDraft(args: {
  scope: OfflineMutationScope;
  targetId: string;
}): Promise<void> {
  await removeOfflineSnapshots({
    scope: args.scope,
    kind: KIND,
    entityIds: [args.targetId],
  });
}

export async function warmMessagingRouteShells(): Promise<void> {
  if (typeof caches === "undefined" || !navigator.onLine) return;
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    ["/portal/messages", "/chat"].map(async (url) => {
      try {
        const response = await fetch(url, {
          credentials: "include",
          headers: { Accept: "text/html" },
        });
        if (response.ok) await cache.put(url, response.clone());
      } catch {
        // A previously warmed shell remains usable when this refresh loses network.
      }
    }),
  );
}
