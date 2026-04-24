"use client";

import { cn } from "@shared/lib/utils";
import type { WorkOrderRecommendationIndicator } from "@/features/ai/server/domains/workOrders/getWorkOrderRecommendationIndicators";

function labelForPriority(priority: WorkOrderRecommendationIndicator["highestPriority"]): string {
  if (!priority) return "No priority";
  return priority.replaceAll("_", " ");
}

function labelForRisk(risk: WorkOrderRecommendationIndicator["highestRiskTier"]): string {
  if (!risk) return "No risk";
  return risk.replaceAll("_", " ");
}

function SignalChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-neutral-200">
      {label}
    </span>
  );
}

export default function WorkOrderAiIndicatorBadge({
  indicator,
  className,
}: {
  indicator: WorkOrderRecommendationIndicator | null | undefined;
  className?: string;
}) {
  if (!indicator || indicator.totalActive <= 0) return null;

  const allAcknowledged = indicator.totalActive > 0 && indicator.acknowledgedCount === indicator.totalActive;

  return (
    <div className={cn("mt-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2", className)}>
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-400">
        <span className="text-neutral-300">AI signals</span>
        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-neutral-100">
          {indicator.totalActive} active
        </span>
        <span className="text-neutral-500">Priority: {labelForPriority(indicator.highestPriority)}</span>
        <span className="text-neutral-500">Risk: {labelForRisk(indicator.highestRiskTier)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {indicator.hasCloseoutRisk ? <SignalChip label="Closeout review" /> : null}
        {indicator.hasPartsDelay ? <SignalChip label="Parts delay" /> : null}
        {indicator.hasDispatchReview ? <SignalChip label="Dispatch review" /> : null}
        {indicator.hasPreviewReady ? <SignalChip label="Preview ready" /> : null}
        {indicator.missingDataCount > 0 ? <SignalChip label={`Missing data (${indicator.missingDataCount})`} /> : null}
        {allAcknowledged ? <SignalChip label="All acknowledged" /> : null}
      </div>
    </div>
  );
}
