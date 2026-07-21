"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import ShopAssistantConversation from "@/features/shop-assistant/components/ShopAssistantConversation";
import { useShopAssistant } from "@/features/shop-assistant/hooks/useShopAssistant";
import type { ShopAssistantContext } from "@/features/shop-assistant/types";
import { Button } from "@shared/components/ui/Button";

function optionalParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

export default function MobileAssistantPage() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [question, setQuestion] = useState("");

  const context = useMemo<ShopAssistantContext>(() => {
    const params = new URLSearchParams(searchKey);
    return {
      workOrderId: optionalParam(params, "workOrderId"),
      vehicleId: optionalParam(params, "vehicleId"),
      customerId: optionalParam(params, "customerId"),
      bookingId: optionalParam(params, "bookingId"),
      invoiceId: optionalParam(params, "invoiceId"),
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
        context.invoiceId,
      ]
        .filter(Boolean)
        .join(":"),
    [context],
  );

  const {
    messages,
    loading,
    sending,
    error,
    canRetry,
    send,
    retry,
    clearConversation,
  } = useShopAssistant(contextKey);

  const submit = async () => {
    const value = question.trim();
    if (!value || sending) return;
    setQuestion("");
    await send(value, context);
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
          Run the shop from one conversation
        </h1>
        <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Ask across work orders, customers, scheduling, parts, billing, and shop
          operations. This conversation is restored when you return.
        </p>
        {contextLabel ? (
          <div className="mt-3 inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]">
            Context: {contextLabel}
          </div>
        ) : null}
      </section>

      <ShopAssistantConversation
        messages={messages}
        loading={loading}
        error={error}
        canRetry={canRetry}
        onRetry={() => void retry()}
        className="max-h-[28rem]"
      />

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <label
          htmlFor="mobile-assistant-question"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]"
        >
          Message
        </label>
        <textarea
          id="mobile-assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about shop status or request an operational action."
          className="mt-2 min-h-32 w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/30"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || sending}
            onClick={() => {
              void clearConversation(context);
              setQuestion("");
            }}
          >
            New
          </Button>
          <Button
            type="button"
            variant="copper"
            size="sm"
            disabled={loading || sending || !question.trim()}
            isLoading={sending}
            onClick={() => void submit()}
          >
            Send
          </Button>
        </div>
      </section>
    </div>
  );
}
