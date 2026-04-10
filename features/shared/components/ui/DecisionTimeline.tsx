"use client";

import { cn } from "@shared/lib/utils";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";

export type DecisionTimelineStage = {
  key: string;
  label: string;
  description?: string;
  state: "past" | "current" | "future";
};

type Props = {
  stages: DecisionTimelineStage[];
  orientation?: "horizontal" | "vertical";
  className?: string;
};

function stageTone(state: DecisionTimelineStage["state"]): string {
  if (state === "current") return "border-[var(--accent-copper-light)]/50 bg-[var(--accent-copper)]/12 text-[var(--accent-copper-light)]";
  if (state === "past") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  return "border-white/10 bg-black/30 text-neutral-500";
}

export default function DecisionTimeline({
  stages,
  orientation = "horizontal",
  className,
}: Props) {
  if (!Array.isArray(stages) || stages.length === 0) return null;

  const vertical = orientation === "vertical";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/25 p-3",
        className,
      )}
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Decision timeline
      </div>
      <ol
        className={cn(
          vertical ? "space-y-2" : "grid gap-2 md:grid-cols-4",
        )}
      >
        {stages.map((stage) => (
          <li key={stage.key} className={cn("rounded-xl border px-3 py-2", stageTone(stage.state))}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">{stage.label}</div>
              <StatusBadge
                size="sm"
                variant={stage.state === "current" ? "active" : stage.state === "past" ? "success" : "neutral"}
                className="px-2 py-0.5 text-[9px]"
              >
                {stage.state}
              </StatusBadge>
            </div>
            {stage.description ? (
              <div className="mt-1 text-[11px] text-neutral-400">{stage.description}</div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
