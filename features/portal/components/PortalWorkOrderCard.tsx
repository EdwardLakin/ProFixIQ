import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  MessageCircle,
  UserRound,
} from "lucide-react";
import type { PortalWorkOrderSummary } from "@/features/portal/server/portalWorkOrders";

const STATUS_STYLE: Record<PortalWorkOrderSummary["status"]["key"], string> = {
  appointment_confirmed: "border-sky-500 bg-sky-200 text-sky-950 shadow-sm shadow-sky-900/10",
  vehicle_received: "border-blue-600 bg-blue-200 text-blue-950 shadow-sm shadow-blue-900/10",
  inspection_underway: "border-violet-600 bg-violet-200 text-violet-950 shadow-sm shadow-violet-900/10",
  approval_needed: "border-amber-600 bg-amber-200 text-amber-950 shadow-sm shadow-amber-900/10",
  work_underway: "border-cyan-600 bg-cyan-200 text-cyan-950 shadow-sm shadow-cyan-900/10",
  waiting_for_parts: "border-orange-600 bg-orange-200 text-orange-950 shadow-sm shadow-orange-900/10",
  final_checks: "border-indigo-600 bg-indigo-200 text-indigo-950 shadow-sm shadow-indigo-900/10",
  ready_for_pickup: "border-emerald-600 bg-emerald-200 text-emerald-950 shadow-sm shadow-emerald-900/10",
  completed:
    "border-slate-500 bg-slate-200 text-slate-900 shadow-sm shadow-slate-900/10",
};

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PortalWorkOrderCard({
  workOrder,
  compact = false,
}: {
  workOrder: PortalWorkOrderSummary;
  compact?: boolean;
}) {
  const updated = dateLabel(workOrder.updatedAt);
  const expected = dateLabel(workOrder.expectedCompletionAt);

  return (
    <article className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] shadow-card backdrop-blur-xl">
      <div className={compact ? "p-4" : "p-4 sm:p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[color:var(--theme-text-primary)]">
              {workOrder.vehicleLabel}
            </p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              {workOrder.reference}
              {workOrder.vehicleDetail ? ` • ${workOrder.vehicleDetail}` : ""}
            </p>
          </div>
          <span
            className={`max-w-[48%] shrink-0 rounded-full border px-2.5 py-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] ${STATUS_STYLE[workOrder.status.key]}`}
          >
            {workOrder.status.label}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Service
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-[color:var(--theme-text-primary)]">
            {workOrder.serviceSummary.map((service) => (
              <li key={service} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent-copper)]" />
                <span>{service}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
          <p>{workOrder.status.nextStep}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {workOrder.advisorName ? (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                Advisor: {workOrder.advisorName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                Shop service team
              </span>
            )}
            {expected ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Expected {expected}
              </span>
            ) : updated ? (
              <span>Updated {updated}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
        <Link
          href={workOrder.messageHref}
          className="inline-flex min-h-12 items-center justify-center gap-2 border-r border-[color:var(--theme-border-soft)] px-3 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {workOrder.advisorName ? "Message advisor" : "Message shop"}
        </Link>
        <Link
          href={workOrder.primaryAction.href}
          className="inline-flex min-h-12 items-center justify-center gap-1 px-3 py-3 text-sm font-semibold text-[var(--accent-copper-light)] transition hover:bg-[color:var(--theme-surface-subtle)]"
        >
          {workOrder.primaryAction.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
