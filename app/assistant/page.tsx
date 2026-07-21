// app/assistant/page.tsx

"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

import { useAssistant } from "@/features/assistant/hooks/useAssistant";
import { useShopState } from "@/features/assistant/hooks/useShopState";
import AssistantConversation from "@/features/assistant/components/AssistantConversation";
import AssistantResponseCard from "@/features/assistant/components/AssistantResponseCard";
import ShopAssistantOverview from "@/features/assistant/components/ShopAssistantOverview";
import type { AssistantContext } from "@/features/assistant/types/assistant";

const EXAMPLE_PROMPTS = [
  "How is the shop doing right now?",
  "Which approvals are blocking revenue today?",
  "Put WO EL00005 on hold for parts.",
  "What should the service desk handle next?",
];

export default function AssistantPage() {
  const [query, setQuery] = useState("");
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const context = useMemo<AssistantContext>(() => {
    const params = new URLSearchParams(searchKey);
    return {
      workOrderId: params.get("workOrderId") ?? undefined,
      vehicleId: params.get("vehicleId") ?? undefined,
      customerId: params.get("customerId") ?? undefined,
      bookingId: params.get("bookingId") ?? undefined,
      pageType: params.get("pageType") ?? undefined,
      pageTitle: params.get("pageTitle") ?? undefined,
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

  const contextChips = useMemo(
    () => [
      { label: "Shop-wide", active: true },
      {
        label: "Current page",
        active: Boolean(context.pageType || context.pageTitle),
      },
      { label: "Current customer", active: Boolean(context.customerId) },
      { label: "Current vehicle", active: Boolean(context.vehicleId) },
      { label: "Current work order", active: Boolean(context.workOrderId) },
    ],
    [context],
  );

  const submit = async () => {
    const value = query.trim();
    if (!value || loading) return;
    await ask(value, context);
    setQuery("");
  };

  return (
    <PageShell
      title="Shop Assistant"
      description="A live operating surface for shop intelligence, proactive attention items, and confirmed actions."
    >
      <div className="space-y-4">
        <ShopAssistantOverview
          state={shopState.state}
          loading={shopState.loading}
          refreshing={shopState.refreshing}
          error={shopState.error}
          onRefresh={shopState.refresh}
        />

        <div className={`${ui.panel} ${ui.panelPadding} space-y-4`}>
          <div className="desktop-panel-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Conversation scope
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {contextChips.map((chip) => (
                <span
                  key={chip.label}
                  className={`desktop-pill px-3 py-1 text-xs ${
                    chip.active
                      ? "border-[color:var(--brand-accent,#E39A6E)]/55 bg-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_16%,transparent)] text-[color:var(--brand-accent,#E39A6E)]"
                      : "text-[color:var(--theme-text-secondary)]"
                  }`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              Ask across work orders, customers, vehicles, approvals, bookings,
              invoices, fleet, parts, reporting, and staff activity. Record changes
              remain reviewable and require confirmation.
            </p>
          </div>

          {hydrating ? (
            <div className="desktop-panel-soft p-4 text-sm text-[color:var(--theme-text-secondary)]">
              Restoring the conversation…
            </div>
          ) : (
            <AssistantConversation messages={messages} />
          )}

          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask about the live shop or request a reviewed action..."
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

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={loading || hydrating || messages.length === 0}
              onClick={() => void clearConversation()}
            >
              Clear conversation
            </Button>
            <Button
              onClick={() => void submit()}
              isLoading={loading}
              disabled={hydrating || !query.trim()}
            >
              Ask Assistant
            </Button>
          </div>

          <AssistantResponseCard
            data={data}
            showAnswer={false}
            actionLoading={actionLoading}
            onConfirmAction={confirmAction}
            onCancelAction={cancelAction}
          />
        </div>
      </div>
    </PageShell>
  );
}
