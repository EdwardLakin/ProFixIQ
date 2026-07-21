"use client";

import { useEffect, useMemo, useRef } from "react";

import type {
  ShopAssistantActionPreview,
  ShopAssistantActionResult,
  ShopAssistantMessage,
} from "@/features/shop-assistant/types";
import { Button } from "@shared/components/ui/Button";

type Props = {
  messages: ShopAssistantMessage[];
  loading?: boolean;
  error?: string | null;
  canRetry?: boolean;
  onRetry?: () => void;
  actionInFlightId?: string | null;
  onConfirmAction?: (actionId: string) => void;
  onCancelAction?: (actionId: string) => void;
  className?: string;
};

function messageLabel(message: ShopAssistantMessage): string {
  if (message.kind === "confirmation") return "Confirmation required";
  if (message.kind === "action_result") return "Action result";
  if (message.kind === "error") return "Assistant error";
  if (message.role === "user") return "You";
  return "Shop Assistant";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function actionPreviewFromMessage(
  message: ShopAssistantMessage,
): ShopAssistantActionPreview | null {
  const action = asRecord(message.payload.action);
  if (
    message.kind !== "confirmation" ||
    typeof action.id !== "string" ||
    typeof action.title !== "string" ||
    typeof action.summary !== "string" ||
    typeof action.expiresAt !== "string" ||
    !Array.isArray(action.consequences)
  ) {
    return null;
  }
  return action as unknown as ShopAssistantActionPreview;
}

function actionResultFromMessage(
  message: ShopAssistantMessage,
): ShopAssistantActionResult | null {
  const action = asRecord(message.payload.action);
  if (
    (message.kind !== "action_result" && message.kind !== "error") ||
    typeof action.id !== "string" ||
    typeof action.status !== "string" ||
    typeof action.summary !== "string"
  ) {
    return null;
  }
  return action as unknown as ShopAssistantActionResult;
}

function riskClasses(risk: ShopAssistantActionPreview["risk"]): string {
  if (risk === "high") return "border-red-400/40 bg-red-500/10 text-red-200";
  if (risk === "medium") {
    return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  }
  return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
}

function resultClasses(status: ShopAssistantActionResult["status"]): string {
  if (status === "succeeded") {
    return "border-emerald-400/35 bg-emerald-500/10";
  }
  if (status === "failed") return "border-red-400/35 bg-red-500/10";
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]";
}

function isTerminalActionStatus(
  status: ShopAssistantActionResult["status"],
): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "expired"
  );
}

export default function ShopAssistantConversation({
  messages,
  loading = false,
  error,
  canRetry = false,
  onRetry,
  actionInFlightId = null,
  onConfirmAction,
  onCancelAction,
  className = "",
}: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const terminalActionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      const result = actionResultFromMessage(message);
      if (result && isTerminalActionStatus(result.status)) ids.add(result.id);
    }
    return ids;
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, loading, error, actionInFlightId]);

  if (messages.length === 0 && !loading && !error) return null;

  return (
    <section
      aria-label="Shop assistant conversation"
      aria-live="polite"
      className={`space-y-3 overflow-y-auto rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 ${className}`}
    >
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isError = message.kind === "error";
        const actionPreview = actionPreviewFromMessage(message);
        const actionResult = actionResultFromMessage(message);
        const actionBusy =
          Boolean(actionPreview) && actionInFlightId === actionPreview?.id;
        const actionExpired = actionPreview
          ? new Date(actionPreview.expiresAt).getTime() <= Date.now()
          : false;
        const actionFinished = actionPreview
          ? terminalActionIds.has(actionPreview.id)
          : false;
        const canAct =
          Boolean(actionPreview) &&
          actionPreview?.status === "pending_confirmation" &&
          !actionExpired &&
          !actionFinished;

        return (
          <article
            key={message.id}
            data-message-id={message.id}
            data-client-message-id={message.clientMessageId ?? undefined}
            className={`rounded-2xl border px-3 py-2 text-sm leading-5 ${
              isUser
                ? "ml-6 border-transparent bg-[color:var(--accent-copper)] text-white"
                : isError
                  ? "mr-6 border-red-400/30 bg-red-500/10 text-[color:var(--theme-text-primary)]"
                  : "mr-6 border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]"
            } ${message.optimistic ? "opacity-75" : ""}`}
          >
            <div
              className={`mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${
                isUser
                  ? "text-white/75"
                  : "text-[color:var(--theme-text-secondary)]"
              }`}
            >
              {messageLabel(message)}
            </div>

            {actionPreview ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{actionPreview.title}</div>
                    <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      {actionPreview.summary}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${riskClasses(
                      actionPreview.risk,
                    )}`}
                  >
                    {actionPreview.risk} risk
                  </span>
                </div>

                {actionPreview.consequences.length > 0 ? (
                  <ul className="space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {actionPreview.consequences.map((consequence) => (
                      <li key={consequence}>• {consequence}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="text-[0.68rem] text-[color:var(--theme-text-muted)]">
                  {actionFinished
                    ? "This confirmation is closed. The action result appears below."
                    : actionExpired
                      ? "This confirmation has expired. Ask again to generate a current preview."
                      : `Expires ${new Date(actionPreview.expiresAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`}
                </div>

                {canAct ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="copper"
                      size="sm"
                      isLoading={actionBusy}
                      disabled={Boolean(actionInFlightId)}
                      onClick={() => onConfirmAction?.(actionPreview.id)}
                    >
                      Confirm and run
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(actionInFlightId)}
                      onClick={() => onCancelAction?.(actionPreview.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : actionResult ? (
              <div
                className={`rounded-xl border p-3 ${resultClasses(actionResult.status)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{actionResult.summary}</div>
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--theme-text-secondary)]">
                    {actionResult.status.replaceAll("_", " ")}
                  </span>
                </div>
                {actionResult.status === "failed" && actionResult.retryable ? (
                  <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
                    The action did not complete. Review the current record state and ask
                    again to create a fresh confirmation.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            )}
          </article>
        );
      })}

      {loading ? (
        <div className="mr-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]">
          Restoring conversation…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-[color:var(--theme-text-primary)]">
          <div>{error}</div>
          {canRetry && onRetry ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={onRetry}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      <div ref={endRef} />
    </section>
  );
}
