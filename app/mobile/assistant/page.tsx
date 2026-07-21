"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import AssistantConversation from "@/features/assistant/components/AssistantConversation";
import AssistantResponseCard from "@/features/assistant/components/AssistantResponseCard";
import ShopAssistantOverview from "@/features/assistant/components/ShopAssistantOverview";
import { useAssistant } from "@/features/assistant/hooks/useAssistant";
import { useShopState } from "@/features/assistant/hooks/useShopState";
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
  const {
    ask,
    loading,
    hydrating,
    actionLoading,
    data,
    messages,
    confirmAction,
    cancelAction,
    clearConversation,
  } = useAssistant(contextKey);
  const shopState = useShopState(context);

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
      <ShopAssistantOverview
        state={shopState.state}
        loading={shopState.loading}
        refreshing={shopState.refreshing}
        error={shopState.error}
        onRefresh={shopState.refresh}
        compact
      />

      {contextLabel ? (
        <div className="inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]">
          Context: {contextLabel}
        </div>
      ) : null}

      {hydrating ? (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          Restoring the conversation…
        </section>
      ) : (
        <AssistantConversation messages={messages} compact />
      )}

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <label
          htmlFor="mobile-assistant-question"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]"
        >
          Ask or take action
        </label>
        <textarea
          id="mobile-assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask how the shop is doing or request a reviewed operational action."
          className="mt-2 min-h-32 w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/30"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || hydrating || messages.length === 0}
            onClick={() => {
              void clearConversation();
              setQuestion("");
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="copper"
            size="sm"
            disabled={loading || hydrating || !question.trim()}
            isLoading={loading}
            onClick={() => void submit()}
          >
            Ask Assistant
          </Button>
        </div>
      </section>

      <AssistantResponseCard
        data={data}
        showAnswer={false}
        actionLoading={actionLoading}
        onConfirmAction={confirmAction}
        onCancelAction={cancelAction}
      />
    </div>
  );
}
