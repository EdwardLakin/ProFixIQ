// app/assistant/page.tsx

"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

import { useAssistant } from "@/features/assistant/hooks/useAssistant";
import AssistantResponseCard from "@/features/assistant/components/AssistantResponseCard";
import type { AssistantContext } from "@/features/assistant/types/assistant";

const EXAMPLE_PROMPTS = [
  "Which work orders are waiting on approvals right now?",
  "Summarize open inspections with safety concerns from this week.",
  "What changed today across bookings, invoices, and technician activity?",
  "Show repeat issues for this vehicle and what we recommended last time.",
];

export default function AssistantPage() {
  const [query, setQuery] = useState("");
  const { ask, loading, data } = useAssistant();
  const searchParams = useSearchParams();

  const context = useMemo<AssistantContext>(() => {
    const workOrderId = searchParams.get("workOrderId") ?? undefined;
    const vehicleId = searchParams.get("vehicleId") ?? undefined;
    const customerId = searchParams.get("customerId") ?? undefined;
    const bookingId = searchParams.get("bookingId") ?? undefined;
    const pageType = searchParams.get("pageType") ?? undefined;
    const pageTitle = searchParams.get("pageTitle") ?? undefined;

    return {
      workOrderId,
      vehicleId,
      customerId,
      bookingId,
      pageType,
      pageTitle,
    };
  }, [searchParams]);

  const contextChips = useMemo(
    () => [
      { label: "Shop-wide", active: true },
      { label: "Current page", active: Boolean(context.pageType || context.pageTitle) },
      { label: "Current customer", active: Boolean(context.customerId) },
      { label: "Current vehicle", active: Boolean(context.vehicleId) },
      { label: "Current work order", active: Boolean(context.workOrderId) },
    ],
    [context],
  );

  return (
    <PageShell
      title="Shop Assistant"
      description="Your universal shop intelligence surface for questions, explanations, and cross-record history."
    >
      <div className={`${ui.panel} ${ui.panelPadding} space-y-4`}>
        <div className="desktop-panel-soft p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Assistant scope
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {contextChips.map((chip) => (
              <span
                key={chip.label}
                className={`desktop-pill px-3 py-1 text-xs ${
                  chip.active
                    ? "border-[color:var(--brand-accent,#E39A6E)]/55 bg-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_16%,transparent)] text-[color:var(--brand-accent,#E39A6E)]"
                    : "text-neutral-400"
                }`}
              >
                {chip.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            Ask across work orders, customers, vehicles, inspections, approvals,
            bookings, invoices, fleet, parts, and staff/shop activity. Current-page
            context is applied when available.
          </p>
        </div>

        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a shop question, request an explanation, or compare records..."
          className="desktop-input min-h-[120px] w-full resize-y rounded-2xl px-3 py-2 text-white"
        />

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              className="desktop-pill px-3 py-1 text-xs text-neutral-300 hover:border-[color:var(--brand-accent,#E39A6E)]/50 hover:text-[color:var(--brand-accent,#E39A6E)]"
              onClick={() => setQuery(example)}
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-center">
          <Button
            onClick={() => ask(query, context)}
            isLoading={loading}
            disabled={!query.trim()}
          >
            Ask Assistant
          </Button>
        </div>

        <AssistantResponseCard data={data} />
      </div>
    </PageShell>
  );
}
