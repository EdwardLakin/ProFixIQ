"use client";

import { format } from "date-fns";
import { cn } from "@shared/lib/utils";
import type { DecisionEvent } from "@/features/shared/lib/decisionEvents";

type DecisionEventFeedProps = {
  events: DecisionEvent[];
  compact?: boolean;
  className?: string;
};

function formatEventTimestamp(timestamp: string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "PP p");
}

export default function DecisionEventFeed({
  events,
  compact = false,
  className,
}: DecisionEventFeedProps): JSX.Element | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/20",
        compact ? "p-2.5" : "p-3",
        className,
      )}
    >
      <div className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500", compact ? "mb-1.5" : "mb-2")}>Decision events</div>
      <ol className={cn(compact ? "space-y-1.5" : "space-y-2")}>
        {events.map((event) => (
          <li
            key={event.id}
            className={cn(
              "rounded-xl border border-white/10 bg-black/25",
              compact ? "px-2.5 py-2" : "px-3 py-2.5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={cn("font-medium text-neutral-100", compact ? "text-xs" : "text-sm")}>{event.label}</p>
              <time className="shrink-0 text-[10px] text-neutral-500">{formatEventTimestamp(event.timestamp)}</time>
            </div>
            {event.actor ? (
              <p className={cn("mt-1 text-neutral-400", compact ? "text-[11px]" : "text-xs")}>By {event.actor}</p>
            ) : null}
            {event.meta ? (
              <p className={cn("mt-0.5 text-neutral-500", compact ? "text-[10px]" : "text-[11px]")}>{event.meta}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
