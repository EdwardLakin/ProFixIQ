"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
  onSubmitPrompt?: (prompt: string) => void;
  promptDisabled?: boolean;
  className?: string;
};

type ClarificationField = {
  name: string;
  label: string;
  type: "text" | "select" | "date" | "datetime";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
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

function clarificationFieldsFromMessage(
  message: ShopAssistantMessage,
): ClarificationField[] {
  if (message.role === "user" || !Array.isArray(message.payload.fields)) {
    return [];
  }

  return message.payload.fields.flatMap((candidate) => {
    const field = asRecord(candidate);
    const type = field.type;
    if (
      typeof field.name !== "string" ||
      typeof field.label !== "string" ||
      (type !== "text" &&
        type !== "select" &&
        type !== "date" &&
        type !== "datetime")
    ) {
      return [];
    }
    const options = Array.isArray(field.options)
      ? field.options.flatMap((option) => {
          const record = asRecord(option);
          return typeof record.label === "string" &&
            typeof record.value === "string"
            ? [{ label: record.label, value: record.value }]
            : [];
        })
      : undefined;
    return [
      {
        name: field.name,
        label: field.label,
        type,
        required: field.required !== false,
        options,
      },
    ];
  });
}

function previousUserQuestion(
  messages: ShopAssistantMessage[],
  beforeIndex: number,
): string {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index].content;
  }
  return "";
}

function ClarificationForm({
  fields,
  originalRequest,
  disabled,
  onSubmitPrompt,
}: {
  fields: ClarificationField[];
  originalRequest: string;
  disabled: boolean;
  onSubmitPrompt: (prompt: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = fields.every(
    (field) => field.required === false || Boolean(values[field.name]?.trim()),
  );

  const submit = () => {
    if (!complete || disabled) return;
    const details = fields
      .flatMap((field) => {
        const value = values[field.name]?.trim();
        return value ? [`${field.label}: ${value}`] : [];
      })
      .join("\n");
    const prompt = originalRequest.trim()
      ? `${originalRequest.trim()}\nAdditional details:\n${details}`
      : `Additional details:\n${details}`;
    onSubmitPrompt(prompt);
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3">
      {fields.map((field) => (
        <label key={field.name} className="block text-xs font-medium">
          <span className="mb-1 block text-[color:var(--theme-text-secondary)]">
            {field.label}
          </span>
          {field.type === "select" ? (
            <select
              value={values[field.name] ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2.5 py-2 text-[color:var(--theme-text-primary)]"
            >
              <option value="">Select…</option>
              {(field.options ?? []).map((option) => (
                <option
                  key={`${option.label}:${option.value}`}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={
                field.type === "datetime"
                  ? "datetime-local"
                  : field.type === "date"
                    ? "date"
                    : "text"
              }
              value={values[field.name] ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2.5 py-2 text-[color:var(--theme-text-primary)]"
            />
          )}
        </label>
      ))}
      <Button
        type="button"
        variant="copper"
        size="sm"
        disabled={disabled || !complete}
        onClick={submit}
      >
        Continue
      </Button>
    </div>
  );
}

type MessageLink = { label: string; href: string };

function linksFromMessage(message: ShopAssistantMessage): MessageLink[] {
  const links: MessageLink[] = [];
  const seen = new Set<string>();
  const add = (label: unknown, href: unknown) => {
    if (typeof href !== "string" || !href.startsWith("/") || seen.has(href)) {
      return;
    }
    seen.add(href);
    links.push({
      label:
        typeof label === "string" && label.trim()
          ? label.trim()
          : "Open record",
      href,
    });
  };

  if (Array.isArray(message.payload.links)) {
    for (const candidate of message.payload.links) {
      const link = asRecord(candidate);
      add(link.label, link.href);
    }
  }
  if (Array.isArray(message.payload.toolCalls)) {
    for (const candidate of message.payload.toolCalls) {
      const call = asRecord(candidate);
      const output = asRecord(call.output);
      add(output.summary, output.href);
      for (const value of Object.values(output)) {
        if (!Array.isArray(value)) continue;
        for (const item of value.slice(0, 8)) {
          const record = asRecord(item);
          add(
            record.customId ??
              record.name ??
              record.title ??
              record.label ??
              record.summary,
            record.href,
          );
        }
      }
    }
  }
  const action = asRecord(message.payload.action);
  const details = asRecord(action.details);
  add(details.summary ?? action.summary, details.href);
  return links.slice(0, 8);
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
  onSubmitPrompt,
  promptDisabled = false,
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
      {messages.map((message, messageIndex) => {
        const isUser = message.role === "user";
        const isError = message.kind === "error";
        const actionPreview = actionPreviewFromMessage(message);
        const actionResult = actionResultFromMessage(message);
        const messageLinks = linksFromMessage(message);
        const clarificationFields = clarificationFieldsFromMessage(message);
        const clarificationAnswered = messages
          .slice(messageIndex + 1)
          .some((candidate) => candidate.role === "user");
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
                      : `Expires ${new Date(
                          actionPreview.expiresAt,
                        ).toLocaleTimeString([], {
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
                  <div className="mt-2 space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
                    <div>
                      The action hit a transient failure. Retrying keeps the
                      original action id so an operation that already committed
                      cannot be duplicated.
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      isLoading={actionInFlightId === actionResult.id}
                      disabled={Boolean(actionInFlightId)}
                      onClick={() => onConfirmAction?.(actionResult.id)}
                    >
                      Retry action
                    </Button>
                  </div>
                ) : null}
                {messageLinks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {messageLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--accent-copper,#c1663b)] hover:bg-[color:var(--theme-surface-overlay)]"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>
                {messageLinks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {messageLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--accent-copper,#c1663b)] hover:bg-[color:var(--theme-surface-overlay)]"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {clarificationFields.length > 0 &&
                onSubmitPrompt &&
                !clarificationAnswered ? (
                  <ClarificationForm
                    fields={clarificationFields}
                    originalRequest={previousUserQuestion(
                      messages,
                      messageIndex,
                    )}
                    disabled={promptDisabled}
                    onSubmitPrompt={onSubmitPrompt}
                  />
                ) : null}
              </div>
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
