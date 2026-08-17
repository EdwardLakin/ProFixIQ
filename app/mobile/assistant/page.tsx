"use client";

import { Bot, Plus, Send, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import ShopAssistantConversation from "@/features/shop-assistant/components/ShopAssistantConversation";
import ShopAssistantDashboard from "@/features/shop-assistant/components/ShopAssistantDashboard";
import { useShopAssistant } from "@/features/shop-assistant/hooks/useShopAssistant";
import type { ShopAssistantContext } from "@/features/shop-assistant/types";
import { Button } from "@shared/components/ui/Button";

function optionalParam(
  params: URLSearchParams,
  key: string,
): string | undefined {
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
    actionInFlightId,
    error,
    canRetry,
    send,
    retry,
    confirmAction,
    cancelAction,
    clearConversation,
  } = useShopAssistant(contextKey);

  const submit = async () => {
    const value = question.trim();
    if (!value || sending) return;
    setQuestion("");
    await send(value, context);
  };

  const hasRecordContext = Boolean(
    context.workOrderId ||
    context.vehicleId ||
    context.customerId ||
    context.bookingId ||
    context.invoiceId,
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Bot aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mobile-dashboard-hero__eyebrow">Shop assistant</div>
            <h1 className="mobile-dashboard-hero__title">
              Ask with shop context
            </h1>
            <p className="mobile-dashboard-hero__subtitle">
              {hasRecordContext
                ? "The current record context is included with this conversation."
                : "Ask a deliberate operational question using the shop data available to your role."}
            </p>
          </div>
          <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#8ed4ff]" />
        </div>
      </section>

      <section className="mobile-command-panel overflow-hidden border">
        <ShopAssistantConversation
          messages={messages}
          loading={loading}
          error={error}
          canRetry={canRetry}
          onRetry={() => void retry()}
          actionInFlightId={actionInFlightId}
          onConfirmAction={(actionId) => void confirmAction(actionId)}
          onCancelAction={(actionId) => void cancelAction(actionId)}
          onSubmitPrompt={(prompt) => void send(prompt, context)}
          promptDisabled={loading || sending || Boolean(actionInFlightId)}
          className="max-h-[31rem]"
        />
      </section>

      <section className="mobile-command-panel border p-4">
        <label
          htmlFor="mobile-assistant-question"
          className="text-sm font-bold text-[color:var(--theme-text-primary)]"
        >
          Shop conversation
        </label>
        <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
          Proposed operational actions still require explicit confirmation.
        </p>
        <textarea
          id="mobile-assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about shop status or request an operational action."
          className="mt-3 min-h-32 resize-none"
        />
        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || sending || Boolean(actionInFlightId)}
            onClick={() => {
              void clearConversation(context);
              setQuestion("");
            }}
            className="mobile-command-secondary inline-flex items-center gap-2 px-3 text-xs font-bold"
          >
            <Plus aria-hidden className="h-4 w-4" />
            New
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={
              loading ||
              sending ||
              Boolean(actionInFlightId) ||
              !question.trim()
            }
            isLoading={sending}
            onClick={() => void submit()}
            className="mobile-command-primary inline-flex items-center justify-center gap-2 px-4 text-sm font-bold"
          >
            <Send aria-hidden className="h-4 w-4" />
            Send
          </Button>
        </div>
      </section>

      <details
        className="overflow-hidden rounded-[1.15rem]"
        open={messages.length === 0}
      >
        <summary className="cursor-pointer px-1 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          Live operational overview
        </summary>
        <ShopAssistantDashboard
          onPrompt={(prompt) => {
            setQuestion("");
            void send(prompt, context);
          }}
          refreshToken={messages.at(-1)?.id}
        />
      </details>
    </main>
  );
}
