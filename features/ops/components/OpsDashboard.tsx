import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Database,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import {
  attentionFeedback,
  buildOpsDashboardMetrics,
  opsFeedbackKind,
  opsFeedbackNeedsAttention,
  opsFeedbackStatus,
  opsFeedbackSurface,
  opsFeedbackTitle,
  type OpsFeedbackSummary,
} from "@/features/ops/lib/dashboard";
import { cn } from "@shared/lib/utils";

function pretty(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(item: OpsFeedbackSummary): string {
  const status = opsFeedbackStatus(item);
  if (status === "completed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "planned") return "border-violet-500/40 bg-violet-500/10 text-violet-300";
  if (status === "in_progress") return "border-orange-500/40 bg-orange-500/10 text-orange-300";
  if (status === "reviewing") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  if (status === "declined") return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-muted)]";
  return opsFeedbackNeedsAttention(item)
    ? "border-red-500/40 bg-red-500/10 text-red-300"
    : "border-sky-500/40 bg-sky-500/10 text-sky-300";
}

function formatUpdated(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  }).format(new Date(value));
}

export default function OpsDashboard({
  feedback,
}: {
  feedback: OpsFeedbackSummary[];
}) {
  const metrics = buildOpsDashboardMetrics(feedback);
  const attention = attentionFeedback(feedback);
  const metricCards = [
    {
      label: "New feedback",
      value: metrics.newSubmissions,
      detail: "Unreviewed submissions",
      tone: "text-sky-300",
    },
    {
      label: "Needs attention",
      value: metrics.needsAttention,
      detail: "Feedback themes requiring review",
      tone: "text-amber-300",
    },
    {
      label: "In progress",
      value: metrics.inProgress,
      detail: "Approved product work underway",
      tone: "text-orange-300",
    },
    {
      label: "Completed",
      value: metrics.completed,
      detail: "Shipped feedback items",
      tone: "text-emerald-300",
    },
  ];
  const controlSurfaces = [
    {
      href: "/ops/feedback",
      label: "Feedback Control",
      detail: "Requests, trends, triage and completion",
      icon: MessageSquareText,
    },
    {
      href: "/ops/system-health",
      label: "System Health",
      detail: "Live application and production data checks",
      icon: Activity,
    },
    {
      href: "/ops/deployments",
      label: "Deployments",
      detail: "Production SHA, GitHub and CI evidence",
      icon: GitBranch,
    },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-400">
            <CircleDot className="h-4 w-4" />
            Owner control room
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Operations overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            Review customer feedback, spot repeated product friction, and monitor production health. AI organizes feedback only; product decisions and engineering remain human-controlled.
          </p>
        </div>
        <Link
          href="/ops/feedback"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-400"
        >
          Open Feedback Control
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Feedback metrics"
      >
        {metricCards.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
              {metric.label}
            </p>
            <p className={cn("mt-2 text-3xl font-black", metric.tone)}>
              {metric.value}
            </p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              {metric.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Operations control surfaces">
        {controlSurfaces.map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card transition hover:border-orange-500/40 hover:bg-orange-500/5"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{label}</p>
              <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">{detail}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-orange-400" />
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
          <div className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-bold">Needs your attention</h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                New and high-impact feedback is surfaced here for product review.
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-xs text-[color:var(--theme-text-secondary)]">
              {metrics.totalSubmissions} submissions
            </span>
          </div>
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {attention.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="mt-3 text-sm font-semibold">
                  No feedback needs attention
                </p>
              </div>
            ) : (
              attention.map((item) => (
                <Link
                  key={item.id}
                  href={`/ops/feedback?feedback=${encodeURIComponent(item.id)}`}
                  className="flex flex-col gap-3 px-4 py-4 transition hover:bg-[color:var(--theme-surface-subtle)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {opsFeedbackNeedsAttention(item) ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <MessageSquareText className="h-4 w-4 shrink-0 text-orange-400" />
                      )}
                      <p className="truncate text-sm font-semibold">
                        {opsFeedbackTitle(item)}
                      </p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--theme-text-muted)]">
                      <span>{pretty(opsFeedbackSurface(item))}</span>
                      <span>{pretty(opsFeedbackKind(item))}</span>
                      <span>Updated {formatUpdated(item.updated_at)}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                      statusTone(item),
                    )}
                  >
                    {pretty(opsFeedbackStatus(item))}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              Operations signals
            </h2>
            <Link
              href="/ops/system-health"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-300 transition hover:text-orange-200"
            >
              Live health
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {[
            {
              icon: Database,
              label: "Feedback ledger",
              detail: `${metrics.totalSubmissions} submissions available`,
            },
            {
              icon: ShieldCheck,
              label: "Access boundary",
              detail: "Owner identity verified",
            },
            {
              icon: AlertTriangle,
              label: "Attention queue",
              detail:
                metrics.needsAttention > 0
                  ? `${metrics.needsAttention} item${metrics.needsAttention === 1 ? "" : "s"} flagged`
                  : "No urgent feedback waiting",
            },
          ].map(({ icon: Icon, label, detail }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                  {detail}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
