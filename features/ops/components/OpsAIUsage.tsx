"use client";

import {
  AlertTriangle,
  Bot,
  Coins,
  Cpu,
  Gauge,
  Package,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type {
  OpsAIUsageBreakdownRow,
  OpsAIUsageSnapshot,
} from "@/features/ops/server/get-ai-usage";

function usd(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value != null && value < 1 ? 4 : 2,
  }).format(value ?? 0);
}

function compact(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function productLabel(value: string): string {
  return value === "engineering_agent" ? "Engineering Agent" : "ProFixIQ App";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Coins;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-card)] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
          {label}
        </span>
        <Icon className="h-4 w-4 text-orange-400" />
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{detail}</div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: OpsAIUsageBreakdownRow[];
  kind?: "product" | "feature";
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-card)]">
      <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3">
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Requests</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={`${row.key}-${row.endpoint ?? ""}-${index}`} className="border-t border-[color:var(--theme-border-soft)]">
                <td className="px-4 py-3">
                  <div className="font-semibold">
                    {kind === "product" ? productLabel(row.key) : row.key}
                  </div>
                  {kind === "feature" && row.endpoint ? (
                    <div className="mt-0.5 max-w-[360px] truncate text-xs text-[color:var(--theme-text-muted)]">
                      {row.endpoint}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{compact(row.requests)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{compact(row.tokens)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd(row.cost)}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[color:var(--theme-text-muted)]">No usage recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function OpsAIUsage({ snapshot }: { snapshot: OpsAIUsageSnapshot }) {
  const s = snapshot.summary;
  const maxTrendCost = Math.max(...snapshot.trend.map((row) => row.cost), 0.000001);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-400">
            <Gauge className="h-4 w-4" />
            AI operations
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">AI Usage</h1>
          <p className="mt-2 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
            Canonical cost, token, failure, and runaway-run observability for ProFixIQ and the Engineering Agent.
          </p>
        </div>
        <div className="text-xs text-[color:var(--theme-text-muted)]">
          Updated {new Date(snapshot.generatedAt).toLocaleString()}
        </div>
      </header>

      {snapshot.warnings.length ? (
        <section className="rounded-2xl border border-red-500/35 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 font-bold text-red-300">
            <ShieldAlert className="h-5 w-5" />
            Cost / usage warnings
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {snapshot.warnings.slice(0, 12).map((warning, index) => (
              <div key={`${warning.kind}-${warning.ref}-${index}`} className="rounded-xl border border-red-500/20 bg-[color:var(--theme-surface-inset)] p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  <div>
                    <div className="text-sm font-bold">{warning.title}</div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{warning.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Spend today" value={usd(s.spendToday)} detail="Estimated provider cost" icon={Coins} />
        <MetricCard label="Last 7 days" value={usd(s.spend7d)} detail="Rolling seven-day spend" icon={TrendingUp} />
        <MetricCard label="Month to date" value={usd(s.spendMonth)} detail="Current calendar month" icon={Package} />
        <MetricCard label="Requests" value={compact(s.requests)} detail={`${compact(s.avgTokensPerRequest)} avg tokens / request`} icon={Cpu} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Input tokens" value={compact(s.promptTokens)} detail="All prompt/input tokens" icon={Cpu} />
        <MetricCard label="Cached input" value={compact(s.cachedPromptTokens)} detail="Provider-reported cached prompt tokens" icon={Package} />
        <MetricCard label="Output tokens" value={compact(s.completionTokens)} detail="Completion/output tokens" icon={Bot} />
        <MetricCard label="Failures" value={compact(s.failures)} detail="Provider or application failures" icon={AlertTriangle} />
        <MetricCard label="429 / quota" value={compact(s.rateLimited)} detail="Rate-limit and no-credit responses" icon={ShieldAlert} />
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-card)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Token and cost trend</h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">Daily usage for the last 30 days.</p>
          </div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">{compact(s.totalTokens)} total tokens</div>
        </div>
        <div className="mt-5 flex h-44 items-end gap-1 overflow-x-auto pb-1">
          {snapshot.trend.length ? snapshot.trend.map((row) => {
            const height = Math.max(4, Math.round((row.cost / maxTrendCost) * 100));
            return (
              <div key={row.bucket} className="group flex min-w-7 flex-1 flex-col items-center justify-end" title={`${new Date(row.bucket).toLocaleDateString()}: ${usd(row.cost)} · ${compact(row.tokens)} tokens · ${row.requests} requests`}>
                <div className="w-full max-w-10 rounded-t-md bg-orange-400/75 transition group-hover:bg-orange-400" style={{ height: `${height}%` }} />
                <span className="mt-2 text-[9px] text-[color:var(--theme-text-muted)]">
                  {new Date(row.bucket).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
                </span>
              </div>
            );
          }) : (
            <div className="m-auto text-sm text-[color:var(--theme-text-muted)]">No trend data yet.</div>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <BreakdownTable title="By product" rows={snapshot.products} kind="product" />
        <BreakdownTable title="By model" rows={snapshot.models} />
        <BreakdownTable title="By feature / endpoint" rows={snapshot.features} kind="feature" />
        <BreakdownTable title="By shop" rows={snapshot.shops} />
        <BreakdownTable title="By user / actor" rows={snapshot.users} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-card)]">
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3">
          <h2 className="font-bold">Highest-cost requests / runs</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            Individual provider calls ranked by estimated cost and token volume.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              <tr>
                <th className="px-4 py-3">Time / product</th>
                <th className="px-4 py-3">Feature</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-right">Input</th>
                <th className="px-4 py-3 text-right">Cached</th>
                <th className="px-4 py-3 text-right">Output</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.expensiveEvents.length ? snapshot.expensiveEvents.map((event) => (
                <tr key={event.id} className="border-t border-[color:var(--theme-border-soft)] align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{productLabel(event.source_product)}</div>
                    <div className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">{new Date(event.occurred_at).toLocaleString()}</div>
                    {event.agent_run_id ? <div className="mt-1 max-w-56 truncate font-mono text-[10px] text-sky-300">run {event.agent_run_id}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{event.feature}</div>
                    <div className="mt-0.5 max-w-72 truncate text-xs text-[color:var(--theme-text-muted)]">{event.endpoint}</div>
                  </td>
                  <td className="px-4 py-3">{event.model ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{compact(event.prompt_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{compact(event.cached_prompt_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{compact(event.completion_tokens)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{compact(event.total_tokens)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{event.cost == null ? "—" : usd(event.cost)}</td>
                  <td className="px-4 py-3">
                    <span className={event.status === "error" ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>
                      {event.status}
                    </span>
                    {event.error_code ? <div className="mt-1 text-[10px] text-red-300">{event.error_code}</div> : null}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-[color:var(--theme-text-muted)]">No AI calls recorded in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
