"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CanonicalRole } from "@/features/shared/lib/rbac";
import type {
  ShopAssistantChatRequest,
  ShopAssistantChatResponse,
  ShopAssistantContext,
  ShopAssistantMessage,
  ShopAssistantMessagesResponse,
  ShopAssistantThread,
  ShopAssistantThreadListResponse,
} from "@/features/shop-assistant/types";

type RetryRequest = ShopAssistantChatRequest;

function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `shop-assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mergeMessages(
  current: ShopAssistantMessage[],
  incoming: ShopAssistantMessage[],
): ShopAssistantMessage[] {
  const byId = new Map<string, ShopAssistantMessage>();
  const serverClientIds = new Set(
    incoming
      .map((message) => message.clientMessageId)
      .filter((value): value is string => Boolean(value)),
  );

  for (const message of current) {
    if (
      message.optimistic &&
      message.clientMessageId &&
      serverClientIds.has(message.clientMessageId)
    ) {
      continue;
    }
    byId.set(message.id, message);
  }

  for (const message of incoming) byId.set(message.id, message);

  return [...byId.values()].sort((left, right) => {
    const timeDelta =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (timeDelta !== 0) return timeDelta;
    return left.id.localeCompare(right.id);
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export function useShopAssistant(resetKey?: string) {
  const [thread, setThread] = useState<ShopAssistantThread | null>(null);
  const [messages, setMessages] = useState<ShopAssistantMessage[]>([]);
  const [role, setRole] = useState<CanonicalRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const loadMessages = useCallback(async (threadId: string) => {
    const response = await fetch(
      `/api/shop-assistant/threads/${encodeURIComponent(threadId)}/messages`,
      { cache: "no-store" },
    );
    const payload = await readJson<ShopAssistantMessagesResponse>(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? "Failed to load conversation" : payload.error);
    }

    setThread(payload.thread);
    setMessages((current) => mergeMessages(current, payload.messages));
  }, []);

  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/shop-assistant/threads", {
        cache: "no-store",
      });
      const payload = await readJson<ShopAssistantThreadListResponse>(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to load assistant" : payload.error);
      }

      setRole(payload.role);
      const active = payload.threads.find(
        (candidate) => candidate.id === payload.activeThreadId,
      );

      if (active) {
        setThread(active);
        await loadMessages(active.id);
      } else {
        setThread(null);
        setMessages([]);
      }
    } catch (restoreError: unknown) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Failed to load shop assistant",
      );
    } finally {
      setLoading(false);
    }
  }, [loadMessages]);

  useEffect(() => {
    void restore();
    return () => abortRef.current?.abort();
  }, [resetKey, restore]);

  const createConversation = useCallback(
    async (context?: ShopAssistantContext) => {
      const response = await fetch("/api/shop-assistant/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const payload = await readJson<ShopAssistantMessagesResponse>(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to create conversation" : payload.error);
      }

      setThread(payload.thread);
      setMessages(payload.messages);
      setRetryRequest(null);
      setError(null);
      return payload.thread;
    },
    [],
  );

  const sendRequest = useCallback(
    async (requestPayload: RetryRequest) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setError(null);

      const optimisticMessage: ShopAssistantMessage = {
        id: `optimistic:${requestPayload.clientMessageId}`,
        threadId: requestPayload.threadId ?? "pending",
        role: "user",
        kind: "text",
        content: requestPayload.question,
        payload: {},
        clientMessageId: requestPayload.clientMessageId,
        createdAt: new Date().toISOString(),
        optimistic: true,
      };
      setMessages((current) => mergeMessages(current, [optimisticMessage]));

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/shop-assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });
        const payload = await readJson<ShopAssistantChatResponse>(response);
        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok ? "Shop assistant request failed" : payload.error);
        }

        setThread(payload.thread);
        setMessages((current) => mergeMessages(current, payload.messages));
        setRetryRequest(null);
      } catch (sendError: unknown) {
        if (controller.signal.aborted) return;
        setRetryRequest(requestPayload);
        setError(
          sendError instanceof Error
            ? sendError.message
            : "Shop assistant request failed",
        );
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        sendingRef.current = false;
        setSending(false);
      }
    },
    [],
  );

  const send = useCallback(
    async (question: string, context?: ShopAssistantContext) => {
      const clean = question.trim();
      if (!clean || sendingRef.current) return;

      let activeThread = thread;
      if (!activeThread) activeThread = await createConversation(context);

      await sendRequest({
        question: clean,
        context,
        threadId: activeThread.id,
        clientMessageId: newClientMessageId(),
      });
    },
    [createConversation, sendRequest, thread],
  );

  const retry = useCallback(async () => {
    if (!retryRequest || sendingRef.current) return;
    await sendRequest(retryRequest);
  }, [retryRequest, sendRequest]);

  const clearConversation = useCallback(
    async (context?: ShopAssistantContext) => {
      abortRef.current?.abort();
      await createConversation(context);
    },
    [createConversation],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return {
    thread,
    messages,
    role,
    loading,
    sending,
    error,
    canRetry: Boolean(retryRequest),
    send,
    retry,
    cancel,
    clearConversation,
    refresh: restore,
  };
}
