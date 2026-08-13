import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Database,
  GitPullRequest,
  ShieldCheck,
} from "lucide-react";
import {
  attentionRequests,
  buildOpsDashboardMetrics,
  isOpsRequestBlocked,
  type OpsAgentRequestSummary,
} from "@/features/ops/lib/dashboard";
import { cn } from "@shared/lib/utils";

function statusLabel(request: OpsAgentRequestSummary): string {
  if (isOpsRequestBlocked(request)) return "blocked";
  return request.status.replace(/_/g, " ");
}

function statusTone(request: OpsAgentRequestSummary): string {
  if (request.status === "awaiting_approval") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  if (isOpsRequestBlocked(request) || request.status === "failed") {
    return "border-red-500/40 bg-red-500/10 text-red-300";
  }
  return "border-sky-500/40 bg-sky-500/10 text-sky-300";
}

function formatUpdated(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OpsDashboard({
  requests,
}: {
  requests: OpsAgentRequestSummary[];
}) {
  const metrics = buildOpsDashboardMetrics(requests);
  const attention = attentionRequests(requests);
  const metricCards = [
    {
      label: "Needs approval",
      value: metrics.awaitingApproval,
      detail: "Human decision required",
      tone: "text-amber-300",
    },
    {
      label: "In progress",
      value: metrics.inProgress,
      detail: "Agent team working",
      tone: "text-sky-300",
    },
    {
      label: "Blocked",
      value: metrics.blocked,
      detail: "Investigation needs input",
      tone: "text-red-300",
    },
    {
      label: "Failed",
      value: metrics.failed,
      detail: "Runtime attention required",
      tone: "text-rose-300",
    },
  ];

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
            Review agent work, make human approval decisions, and see the health
            of the engineering workflow without entering the tenant application.
          </p>
        </div>
        <Link
          href="/ops/agent-control"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-400"
        >
          Open Agent Control
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Agent request metrics"
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
          <div className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-bold">Needs your attention</h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Approval, blocked, failed, and unstarted requests are
                prioritized here.
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-xs text-[color:var(--theme-text-secondary)]">
              {metrics.open} open
            </span>
          </div>
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {attention.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="mt-3 text-sm font-semibold">
                  No requests need attention
                </p>
              </div>
            ) : (
              attention.map((request) => (
                <Link
                  key={request.id}
                  href={`/ops/agent-control?request=${encodeURIComponent(request.id)}`}
                  className="flex flex-col gap-3 px-4 py-4 transition hover:bg-[color:var(--theme-surface-subtle)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 shrink-0 text-orange-400" />
                      <p className="truncate text-sm font-semibold">
                        {request.description}
                      </p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--theme-text-muted)]">
                      <span>
                        {request.intent?.replace(/_/g, " ") ?? "agent request"}
                      </span>
                      <span>Updated {formatUpdated(request.updated_at)}</span>
                      {request.github_pr_number ? (
                        <span className="inline-flex items-center gap-1">
                          <GitPullRequest className="h-3 w-3" />#
                          {request.github_pr_number}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                      statusTone(request),
                    )}
                  >
                    {statusLabel(request)}
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
              label: "Agent requests",
              detail: `${metrics.total} requests available`,
            },
            {
              icon: ShieldCheck,
              label: "Access boundary",
              detail: "Owner identity verified",
            },
            {
              icon: AlertTriangle,
              label: "Decision queue",
              detail:
                metrics.awaitingApproval > 0
                  ? `${metrics.awaitingApproval} approval${metrics.awaitingApproval === 1 ? "" : "s"} waiting`
                  : "No approvals waiting",
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
