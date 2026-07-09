"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  sessionId: string;
  hasRecommendations: boolean;
};

export default function RunAnalysisButton({ sessionId, hasRecommendations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setError(null);
    setMessage(null);
    setIsRunning(true);
    const response = await fetch(`/api/onboarding-v2/guided/sessions/${sessionId}/analysis`, { method: "POST" });
    const payload = await response.json().catch(() => null) as { createdCount?: number; skippedCount?: number; error?: string } | null;
    if (!response.ok) {
      setError(payload?.error ?? "Unable to run AI Business Analysis.");
      setIsRunning(false);
      return;
    }
    setMessage(`Analysis complete: ${payload?.createdCount ?? 0} created, ${payload?.skippedCount ?? 0} skipped.`);
    startTransition(() => router.refresh());
    setIsRunning(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runAnalysis}
        disabled={isRunning || isPending}
        className="rounded-full border border-orange-300/35 bg-orange-300/10 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-300/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning || isPending ? "Running analysis…" : hasRecommendations ? "Re-run analysis" : "Run AI Business Analysis"}
      </button>
      {message ? <p className="text-xs text-emerald-200">{message}</p> : null}
      {error ? <p className="text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
