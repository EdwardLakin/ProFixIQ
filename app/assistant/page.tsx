"use client";

import { useState } from "react";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

import { useAssistant } from "@/features/assistant/hooks/useAssistant";
import AssistantResponseCard from "@/features/assistant/components/AssistantResponseCard";

export default function AssistantPage() {
  const [query, setQuery] = useState("");
  const { ask, loading, data } = useAssistant();

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
            onClick={() => ask(query)}
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
