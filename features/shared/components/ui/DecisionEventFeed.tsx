"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";
import { cn } from "@shared/lib/utils";
import type { DecisionEvent } from "@/features/shared/lib/decisionEvents";

type DecisionEventFeedProps = {
  events: DecisionEvent[];
  compact?: boolean;
  className?: string;
  filter?: "all" | "approvals" | "execution" | "evidence";
  maxVisible?: number;
};

function formatEventTimestamp(timestamp: string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "PP p");
}

const FILTER_OPTIONS: Array<{
  value: NonNullable<DecisionEventFeedProps["filter"]>;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "approvals", label: "Approvals" },
  { value: "execution", label: "Execution" },
  { value: "evidence", label: "Evidence" },
];

function sourceLabel(source: DecisionEvent["source"]): string | null {
  if (source === "approval") return "From approval";
  if (source === "status") return "From status change";
  if (source === "evidence") return "From evidence";
  if (source === "system") return "From system";
  return null;
}

function matchesFilter(event: DecisionEvent, filter: NonNullable<DecisionEventFeedProps["filter"]>): boolean {
  if (filter === "all") return true;
  if (filter === "approvals") {
    return (
      event.source === "approval" ||
      event.type === "approved" ||
      event.type === "declined" ||
      event.type === "sent_for_approval"
    );
  }
  if (filter === "execution") {
    return event.type === "status_changed" || event.type === "work_started" || event.type === "completed";
  }
  return event.source === "evidence" || event.type === "evidence_added";
}

export default function DecisionEventFeed({
  events,
  compact = false,
  className,
  filter = "all",
  maxVisible = 5,
}: DecisionEventFeedProps): JSX.Element | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  const [activeFilter, setActiveFilter] = useState<NonNullable<DecisionEventFeedProps["filter"]>>(filter);
  const [expanded, setExpanded] = useState(false);
  const showFilterControls = !compact && events.length > maxVisible;

  const filteredEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, activeFilter)),
    [events, activeFilter],
  );

  const visibleEvents = expanded ? filteredEvents : filteredEvents.slice(-Math.max(maxVisible, 1));
  const hiddenCount = filteredEvents.length - visibleEvents.length;

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/20",
        compact ? "p-2.5" : "p-3",
        className,
      )}
    >
      <div className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500", compact ? "mb-1.5" : "mb-2")}>Decision events</div>
      {showFilterControls ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setExpanded(false);
                setActiveFilter(option.value);
              }}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] transition",
                activeFilter === option.value
                  ? "border-white/20 bg-white/10 text-neutral-200"
                  : "border-white/10 bg-white/5 text-neutral-500 hover:text-neutral-300",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <ol className={cn(compact ? "space-y-1.5" : "space-y-2")}>
        {visibleEvents.map((event) => (
          <li
            key={event.id}
            className={cn(
              "rounded-xl border border-white/10 bg-black/25",
              compact ? "px-2.5 py-2" : "px-3 py-2.5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500/60",
                    event.confidence === "medium" && "bg-neutral-500/45",
                    event.confidence === "low" && "bg-neutral-500/30",
                  )}
                  title={
                    event.confidence === "low"
                      ? "Low confidence timestamp (fallback/system-derived)"
                      : event.confidence === "medium"
                        ? "Medium confidence timestamp (inferred transition)"
                        : undefined
                  }
                />
                <p className={cn("truncate font-medium text-neutral-100", compact ? "text-xs" : "text-sm")}>{event.label}</p>
              </div>
              <time className="shrink-0 text-[10px] text-neutral-500">{formatEventTimestamp(event.timestamp)}</time>
            </div>
            {event.actor ? (
              <p className={cn("mt-1 text-neutral-400", compact ? "text-[11px]" : "text-xs")}>By {event.actor}</p>
            ) : null}
            {sourceLabel(event.source) ? (
              <p className={cn("mt-0.5 text-neutral-500", compact ? "text-[10px]" : "text-[11px]")}>{sourceLabel(event.source)}</p>
            ) : null}
            {event.meta ? (
              <p className={cn("mt-0.5 text-neutral-500", compact ? "text-[10px]" : "text-[11px]")}>{event.meta}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {!expanded && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11px] text-neutral-400 transition hover:text-neutral-200"
        >
          Show more history
        </button>
      ) : null}
    </div>
  );
}
