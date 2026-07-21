// app/assistant/page.tsx

"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import ShopAssistantConversation from "@/features/shop-assistant/components/ShopAssistantConversation";
import ShopAssistantDashboard from "@/features/shop-assistant/components/ShopAssistantDashboard";
import { useShopAssistant } from "@/features/shop-assistant/hooks/useShopAssistant";
import type { ShopAssistantContext } from "@/features/shop-assistant/types";
import { Button } from "@shared/components/ui/Button";

const EXAMPLE_PROMPTS = [
  "Which work orders are waiting on approvals right now?",
  "Summarize the jobs delayed by parts.",
  "What changed today across bookings, invoices, and technician activity?",
  "Which queued jobs should be assigned next?",
];

function optionalParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

export default function AssistantPage() {
  const [query, setQuery] = useState("");
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const context = useMemo<ShopAssistantContext>(() => {
    const params = new URLSearchParams(searchKey);
    return {
      workOrderId: optionalParam(params, "workOrderId"),
      vehicleId: optionalParam(params, "vehicleId"),
      customerId: optionalParam(params, "customerId"),
      bookingId: optionalParam(params, "bookingId"),
      invoiceId: optionalParam(params, "invoiceId"),
      pageType: optionalParam(params, "pageType") ?? "desktop",
      pageTitle: optionalParam(params, "pageTitle") ?? "Shop Assistant",
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
    const value = query.trim();
    if (!value || sending) return;
    setQuery("");
    await send(value, context);
  };

  return (
    <PageShell
      title="Shop Assistant"
      description="Live shop intelligence, proactive alerts, and a durable operations conversation."
    >
      <div className="space-y-4">
        <ShopAssistantDashboard
          onPrompt={setQuery}
          refreshToken={messages.at(-1)?.id}
        />

        <div className={`${ui.panel} ${ui.panelPadding} space-y-4`}>
          <div className="desktop-panel-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Shop conversation
            </div>
            <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
              Ask questions or request operational actions across the shop. Diagnostic
              guidance remains inside each work order&apos;s Technician AI.
            </p>
          </div>

          <ShopAssistantConversation
            messages={messages}
            loading={loading}
            error={error}
            canRetry={canRetry}
            onRetry={() => void retry()}
            className="max-h-[34rem]"
          />

          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask about shop operations or request an action…"
            className="desktop-input min-h-[120px] w-full resize-y rounded-2xl px-3 py-2 text-[color:var(--theme-text-primary)]"
          />

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                className="desktop-pill px-3 py-1 text-xs text-[color:var(--theme-text-secondary)] hover:border-[color:var(--brand-accent,#E39A6E)]/50 hover:text-[color:var(--brand-accent,#E39A6E)]"
                onClick={() => setQuery(example)}
              >
                {example}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={loading || sending}
              onClick={() => void clearConversation(context)}
            >
              New conversation
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              isLoading={sending}
              disabled={loading || sending || !query.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
