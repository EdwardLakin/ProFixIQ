"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import AssistantResponseCard from "@/features/assistant/components/AssistantResponseCard";
import { useAssistant } from "@/features/assistant/hooks/useAssistant";
import type { AssistantContext } from "@/features/assistant/types/assistant";
import { Button } from "@shared/components/ui/Button";

function optionalParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

export default function MobileAssistantPage() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [question, setQuestion] = useState("");

  const context = useMemo<AssistantContext>(() => {
    const params = new URLSearchParams(searchKey);
    return {
      workOrderId: optionalParam(params, "workOrderId"),
      vehicleId: optionalParam(params, "vehicleId"),
      customerId: optionalParam(params, "customerId"),
      bookingId: optionalParam(params, "bookingId"),
      pageType: optionalParam(params, "pageType") ?? "mobile",
      pageTitle: optionalParam(params, "pageTitle") ?? "Mobile",
    };
  }, [searchKey]);

  const contextKey = useMemo(
    () =>
      [
        context.pageType,
        context.workOrderId,
        context.vehicleId,
        context.customerId,
        context.bookingId,
      ]
        .filter(Boolean)
        .join(":"),
    [context],
  );
  const { ask, loading, data, messages, clearConversation } =
    useAssistant(contextKey);

  const submit = async () => {
    const value = question.trim();
    if (!value || loading) return;
    await ask(value, context);
    setQuestion("");
  };

  const contextLabel = [
    context.workOrderId ? "Work order" : null,
    context.vehicleId ? "Vehicle" : null,
    context.customerId ? "Customer" : null,
    context.bookingId ? "Appointment" : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Shop assistant
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Ask a question
        </h1>
        <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          This is a deliberate question-and-answer tool. It does not change work
          orders, appointments, parts, or shop records automatically.
        </p>
        {contextLabel ? (
          <div className="mt-3 inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]">
            Context: {contextLabel}
          </div>
        ) : null}
      </section>

      {messages.length > 0 ? (
        <section className="max-h-64 space-y-2 overflow-y-auto rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3">
          {messages.slice(-8).map((message, index) => (
            <div
              key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
              className={`rounded-2xl px-3 py-2 text-sm leading-5 ${
                message.role === "user"
                  ? "ml-6 bg-[color:var(--accent-copper)] text-white"
                  : "mr-6 border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]"
              }`}
            >
              {message.content}
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <label
          htmlFor="mobile-assistant-question"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]"
        >
          Question
        </label>
        <textarea
          id="mobile-assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about shop status, a customer, a work order, parts, appointments, or fleet operations."
          className="mt-2 min-h-32 w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/30"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || messages.length === 0}
            onClick={() => {
              clearConversation();
              setQuestion("");
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="copper"
            size="sm"
            disabled={loading || !question.trim()}
            isLoading={loading}
            onClick={() => void submit()}
          >
            Ask Assistant
          </Button>
        </div>
      </section>

      <AssistantResponseCard data={data} />
    </div>
  );
}
