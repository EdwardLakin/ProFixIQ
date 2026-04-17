// app/assistant/page.tsx

"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

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
      <div className="metal-card rounded-3xl p-5">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Assistant scope
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {contextChips.map((chip) => (
              <span
                key={chip.label}
                className={`rounded-full border px-3 py-1 text-xs ${
                  chip.active
                    ? "border-orange-400/40 bg-orange-500/10 text-orange-300"
                    : "border-white/15 bg-black/30 text-neutral-400"
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
          className="mt-4 w-full min-h-[120px] rounded-2xl bg-black/60 p-3 text-white"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-neutral-300 hover:border-orange-400/40 hover:text-orange-200"
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
