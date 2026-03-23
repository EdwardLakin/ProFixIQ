// app/assistant/page.tsx

"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

import { useAssistant } from "@/features/assistant/hooks/useAssistant";
import AssistantResponseCard from "@/features/assistant/components/AssistantResponseCard";
import type { AssistantContext } from "@/features/assistant/types/assistant";

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

  return (
    <PageShell
      title="AI Assistant"
      description="Ask anything about your shop"
    >
      <div className="metal-card rounded-3xl p-5">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your shop..."
          className="w-full min-h-[120px] rounded-2xl bg-black/60 p-3 text-white"
        />

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
