"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  Info,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  OwnerIntelligenceReport,
  OwnerReportComparison,
  OwnerReportRange,
  OwnerReportSummaryResponse,
} from "@/features/owner/reports/ownerIntelligenceTypes";

type SectionKey = "executive" | "financial" | "workflow" | "workforce" | "quality";

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "executive", label: "Executive" },
  { key: "financial", label: "Financial" },
  { key: "workflow", label: "Lost time" },
  { key: "workforce", label: "Workforce" },
  { key: "quality", label: "Quality" },
];

const RANGES: Array<{ key: OwnerReportRange; label: string; short: string }> = [
  { key: "weekly", label: "This week", short: "Week" },
  { key: "monthly", label: "This month", short: "Month" },
  { key: "quarterly", label: "This quarter", short: "Quarter" },
  { key: "yearly", label: "This year", short: "Year" },
];

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: digits,
  }).format(value);
}

function metricPct(value: number | null): string {
  return value == null ? "Not enough evidence" : `${value.toFixed(1)}%`;
}

function hours(value: number): string {
  return `${number(value, 1)}h`;
}

function dateRange(report: OwnerIntelligenceReport): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: report.shop.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${formatter.format(new Date(report.period.start))} – ${formatter.format(new Date(report.generatedAt))}`;
}

function deltaLabel(value: OwnerReportComparison): string {
  if (value.deltaPct == null) return "No prior baseline";
  return `${value.deltaPct >= 0 ? "+" : ""}${value.deltaPct.toFixed(1)}% vs prior`;
}

function Delta({ comparison, inverse = false }: { comparison: OwnerReportComparison; inverse?: boolean }) {
  if (comparison.deltaPct == null) {
    return <span className="text-[11px] text-[color:var(--theme-text-muted)]">No prior baseline</span>;
  }
  const positive = inverse ? comparison.deltaPct <= 0 : comparison.deltaPct >= 0;
  const Icon = comparison.deltaPct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${positive ? "text-emerald-300" : "text-amber-300"}`}>
      <Icon className="h-3 w-3" />
      {deltaLabel(comparison)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  comparison,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  comparison?: OwnerReportComparison;
  tone?: "default" | "positive" | "watch";
}) {
  const valueTone =
    tone === "positive"
      ? "text-emerald-200"
      : tone === "watch"
        ? "text-amber-200"
        : "text-[color:var(--theme-text-primary)]";
  return (
    <article className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-soft)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${valueTone}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{detail}</div>
      {comparison ? <div className="mt-2"><Delta comparison={comparison} /></div> : null}
    </article>
  );
}

function SectionCard({
  eyebrow,
  title,
  detail,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300/80">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)] sm:text-xl">
            {title}
          </h2>
          {detail ? (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              {detail}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FocusIcon({ severity }: { severity: OwnerIntelligenceReport["focus"][number]["severity"] }) {
  if (severity === "positive") return <CheckCircle2 className="h-5 w-5 text-emerald-300" />;
  if (severity === "critical") return <AlertTriangle className="h-5 w-5 text-red-300" />;
  if (severity === "watch") return <Clock3 className="h-5 w-5 text-amber-300" />;
  return <Info className="h-5 w-5 text-sky-300" />;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-[24px] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
        ))}
      </div>
    </div>
  );
}

export default function OwnerIntelligenceClient({
  mobile = false,
  initialSection = "executive",
}: {
  mobile?: boolean;
  initialSection?: SectionKey;
}) {
  const [range, setRange] = useState<OwnerReportRange>("monthly");
  const [section, setSection] = useState<SectionKey>(initialSection);
  const [report, setReport] = useState<OwnerIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summaryRequestedFor = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/reports/owner?range=${range}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as
          | OwnerIntelligenceReport
          | { error?: string }
          | null;
        if (!response.ok || !json || !("metricVersion" in json)) {
          throw new Error(
            json && "error" in json && json.error
              ? json.error
              : "Unable to load owner intelligence",
          );
        }
        setReport(json);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load owner intelligence",
        );
        setReport(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range]);

  const requestSummary = async (force = false) => {
    if (!report || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const response = await fetch("/api/ai/summarize-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range, force }),
      });
      const json = (await response.json().catch(() => null)) as
        | OwnerReportSummaryResponse
        | { error?: string }
        | null;
      if (!response.ok || !json || !("summary" in json)) {
        throw new Error(
          json && "error" in json && json.error
            ? json.error
            : "Unable to generate executive summary",
        );
      }
      setReport((current) =>
        current
          ? {
              ...current,
              executiveSummary: {
                text: json.summary,
                source:
                  json.source === "ai" || json.source === "cached_ai"
                    ? "cached_ai"
                    : "cached_deterministic",
                generatedAt: json.generatedAt,
              },
            }
          : current,
      );
    } catch (summaryError: unknown) {
      setError(
        summaryError instanceof Error
          ? summaryError.message
          : "Unable to generate executive summary",
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!report || report.executiveSummary.text) return;
    if (summaryRequestedFor.current === report.snapshotHash) return;
    summaryRequestedFor.current = report.snapshotHash;
    void requestSummary(false);
    // requestSummary is intentionally keyed to the server snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.snapshotHash]);

  const currency = report?.shop.currency ?? "CAD";
  return (
    <div className={`mx-auto w-full ${mobile ? "max-w-5xl px-3 pb-24 pt-4" : "max-w-[1800px]"} space-y-4 text-foreground`}>
      <header className="overflow-hidden rounded-[28px] border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_42%),var(--theme-gradient-panel)] p-4 shadow-[var(--theme-shadow-strong)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300/80">
              <Sparkles className="h-3.5 w-3.5" />
              Owner intelligence
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--theme-text-primary)] sm:text-3xl">
              Know what moved—and where the shop lost time.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
              One verified view of financial performance, workflow delay, workforce output, and data confidence.
            </p>
          </div>
          {report ? (
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-right">
              <div className="text-xs font-medium text-[color:var(--theme-text-primary)]">{report.shop.name}</div>
              <div className="mt-0.5 text-[10px] text-[color:var(--theme-text-muted)]">{dateRange(report)} · {report.shop.timezone}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={`min-h-10 rounded-full border px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70 ${
                range === item.key
                  ? "border-orange-300/70 bg-orange-400 text-slate-950 shadow-[0_0_24px_rgba(251,146,60,0.28)]"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)] hover:border-orange-300/50 hover:text-[color:var(--theme-text-primary)]"
              }`}
            >
              {mobile ? item.short : item.label}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 text-xs font-medium text-[color:var(--theme-text-secondary)] hover:border-orange-300/50 hover:text-[color:var(--theme-text-primary)]"
            >
              <Printer className="h-4 w-4" />
              Print current view
            </button>
            <Link
              href="/dashboard/owner/reports?tab=health"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 text-xs font-medium text-[color:var(--theme-text-secondary)] hover:border-sky-300/50 hover:text-[color:var(--theme-text-primary)]"
            >
              <ShieldCheck className="h-4 w-4" />
              Data health
            </Link>
          </div>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-1.5">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-semibold transition ${
              section === item.key
                ? "bg-[color:var(--theme-surface-subtle)] text-orange-200 shadow-[var(--theme-shadow-soft)]"
                : "text-[color:var(--theme-text-muted)] hover:text-[color:var(--theme-text-primary)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-400/40 bg-red-950/30 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-medium">Owner intelligence needs attention</div>
            <div className="mt-1 text-red-100/80">{error}</div>
          </div>
        </div>
      ) : null}

      {loading ? <LoadingState /> : null}

      {!loading && report ? (
        <>
          {section === "executive" ? (
            <div className="space-y-4">
              <SectionCard
                eyebrow={`${report.period.label} · Executive brief`}
                title="What changed, what slowed down, and what deserves attention"
                detail="The narrative explains server-calculated evidence. AI does not calculate these totals or infer missing shop activity."
                action={
                  <button
                    type="button"
                    disabled={summaryLoading}
                    onClick={() => void requestSummary(true)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-orange-300/40 bg-orange-400/10 px-4 text-xs font-semibold text-orange-200 hover:bg-orange-400/20 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`} />
                    {summaryLoading ? "Analyzing" : "Refresh summary"}
                  </button>
                }
              >
                <div className="rounded-2xl border border-orange-300/25 bg-[color:var(--theme-surface-inset)] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">
                    <Bot className="h-4 w-4" />
                    ProFixIQ executive summary
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[color:var(--theme-text-primary)]">
                    {report.executiveSummary.text ??
                      (summaryLoading
                        ? "Building the executive summary from the verified report snapshot…"
                        : "The verified report is ready. Generate the executive summary to add the plain-language analysis.")}
                  </p>
                  <div className="mt-3 text-[10px] text-[color:var(--theme-text-muted)]">
                    {report.executiveSummary.source === "cached_ai"
                      ? "AI explanation · cached to this evidence snapshot"
                      : report.executiveSummary.source === "cached_deterministic"
                        ? "Deterministic fallback · cached to this evidence snapshot"
                        : "Awaiting summary generation"}
                  </div>
                </div>
              </SectionCard>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Issued revenue"
                  value={money(report.financial.issuedRevenue.current, currency)}
                  detail={`${report.financial.issuedInvoices.current} issued invoice${report.financial.issuedInvoices.current === 1 ? "" : "s"} · dated by invoice issue`}
                  comparison={report.financial.issuedRevenue}
                />
                <MetricCard
                  label="Average repair order"
                  value={money(report.financial.averageRepairOrder.current, currency)}
                  detail="Issued revenue divided by issued invoices"
                  comparison={report.financial.averageRepairOrder}
                />
                <MetricCard
                  label="Known contribution"
                  value={money(report.financial.knownContribution.current, currency)}
                  detail={`${report.financial.costCoveragePct.toFixed(0)}% cost coverage · not labeled profit`}
                  comparison={report.financial.knownContribution}
                  tone={report.financial.knownContribution.current >= 0 ? "positive" : "watch"}
                />
                <MetricCard
                  label="Overall proficiency"
                  value={metricPct(report.workforce.proficiencyPct)}
                  detail="Billed hours ÷ attendance hours"
                  tone={
                    report.workforce.proficiencyPct != null &&
                    report.workforce.proficiencyPct >= 90
                      ? "positive"
                      : "default"
                  }
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
                <SectionCard
                  eyebrow="Period trend"
                  title="Issued revenue and known contribution"
                  detail="Invoices are placed on the chart by invoice issue date, so imported history stays on its actual business date."
                >
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={report.trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ownerRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fb923c" stopOpacity={0.38} />
                            <stop offset="95%" stopColor="#fb923c" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "var(--theme-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "var(--theme-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${Math.round(Number(value) / 1_000)}k`} />
                        <Tooltip
                          formatter={(value, name) => [
                            money(Number(value), currency),
                            name === "revenue" ? "Issued revenue" : "Known contribution",
                          ]}
                          contentStyle={{
                            background: "var(--theme-surface-panel)",
                            border: "1px solid var(--theme-border-soft)",
                            borderRadius: 12,
                            color: "var(--theme-text-primary)",
                          }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#fb923c" strokeWidth={2.5} fill="url(#ownerRevenue)" />
                        <Area type="monotone" dataKey="knownContribution" stroke="#34d399" strokeWidth={1.8} fill="transparent" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>

                <SectionCard
                  eyebrow="Priority"
                  title="Focus next"
                  detail="Each signal links back to the operational evidence."
                >
                  <div className="space-y-2">
                    {report.focus.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group flex items-start gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 transition hover:border-orange-300/40 hover:bg-[color:var(--theme-surface-subtle)]"
                      >
                        <FocusIcon severity={item.severity} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{item.title}</div>
                          <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{item.detail}</div>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : null}

          {section === "financial" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Issued revenue" value={money(report.financial.issuedRevenue.current, currency)} detail="Invoice totals dated by invoice issue date" comparison={report.financial.issuedRevenue} />
                <MetricCard label="Paid and refunded" value={money(report.financial.collectedRevenue.current, currency)} detail="Net successful payment evidence in this period" comparison={report.financial.collectedRevenue} />
                <MetricCard label="Known costs" value={money(report.financial.knownCosts, currency)} detail="Recorded labor cost + parts cost + expenses" />
                <MetricCard label="Known margin" value={metricPct(report.financial.knownMarginPct)} detail={`${report.financial.costCoveredInvoices} invoices with recorded cost basis`} tone={report.financial.costCoveragePct < 80 ? "watch" : "default"} />
              </div>
              <SectionCard
                eyebrow="Financial truth"
                title="Contribution is explicit about what ProFixIQ knows"
                detail="The old interface called incomplete contribution “profit” and also mislabeled its margin as efficiency. Those labels are intentionally removed."
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                    <div className="text-xs text-[color:var(--theme-text-muted)]">Cost coverage</div>
                    <div className="mt-2 text-3xl font-semibold text-[color:var(--theme-text-primary)]">{report.financial.costCoveragePct.toFixed(0)}%</div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, report.financial.costCoveragePct)}%` }} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 md:col-span-2">
                    <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">Metric contract</div>
                    <ul className="mt-2 space-y-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      <li>• Revenue uses the invoice issue date, never the row import date.</li>
                      <li>• Collected revenue uses successful payment events less refunds and reversals.</li>
                      <li>• Known contribution stays visibly qualified until cost coverage is complete.</li>
                    </ul>
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : null}

          {section === "workflow" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Waiting for approval" value={hours(report.workflow.awaitingApprovalHours)} detail={`${report.workflow.awaitingApprovalCount} open work orders`} tone={report.workflow.awaitingApprovalCount > 0 ? "watch" : "positive"} />
                <MetricCard label="Waiting for parts" value={hours(report.workflow.waitingForPartsHours)} detail={`${report.workflow.waitingForPartsCount} open work orders`} tone={report.workflow.waitingForPartsCount > 0 ? "watch" : "positive"} />
                <MetricCard label="On hold" value={hours(report.workflow.onHoldHours)} detail={`${report.workflow.onHoldWorkOrders} open work orders · not called revenue`} tone={report.workflow.onHoldWorkOrders > 0 ? "watch" : "positive"} />
                <MetricCard label="Ready to invoice" value={hours(report.workflow.readyToInvoiceHours)} detail={`${report.workflow.readyToInvoiceCount} completed work orders waiting to bill`} tone={report.workflow.readyToInvoiceCount > 0 ? "watch" : "positive"} />
              </div>
              <SectionCard
                eyebrow="Measured delay"
                title="Where time is visibly accumulating right now"
                detail="Stage hours are a current queue snapshot. A work order can contain multiple people, so these hours must not be interpreted as additive employee idle time."
              >
                <div className="grid gap-3 lg:grid-cols-2">
                  {[
                    { label: "Customer approval", value: report.workflow.awaitingApprovalHours, count: report.workflow.awaitingApprovalCount, href: "/work-orders/board?stage=awaiting_approval" },
                    { label: "Parts", value: report.workflow.waitingForPartsHours, count: report.workflow.waitingForPartsCount, href: "/work-orders/board?stage=waiting_parts" },
                    { label: "On hold", value: report.workflow.onHoldHours, count: report.workflow.onHoldWorkOrders, href: "/work-orders/board?stage=on_hold" },
                    { label: "Billing handoff", value: report.workflow.readyToInvoiceHours, count: report.workflow.readyToInvoiceCount, href: "/work-orders/board?stage=ready_to_invoice" },
                  ].map((row) => (
                    <Link key={row.label} href={row.href} className="group rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 hover:border-orange-300/40">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{row.label}</div>
                          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{row.count} open work orders</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-semibold text-orange-200">{hours(row.value)}</div>
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-[color:var(--theme-text-muted)]">View evidence <ArrowRight className="h-3 w-3" /></div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-400/5 p-4 text-xs leading-5 text-sky-100/80">
                  Average customer decision time: {report.workflow.averageApprovalHours == null ? "not enough completed decisions" : `${report.workflow.averageApprovalHours.toFixed(1)} hours across ${report.workflow.approvalSamples} decisions`}. Historical stage durations remain unknown where durable transition evidence does not exist.
                </div>
              </SectionCard>
            </div>
          ) : null}

          {section === "workforce" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Efficiency" value={metricPct(report.workforce.efficiencyPct)} detail="Billed hours ÷ job-clock hours" />
                <MetricCard label="Productivity" value={metricPct(report.workforce.productivityPct)} detail="Job-clock hours ÷ attendance hours" />
                <MetricCard label="Overall proficiency" value={metricPct(report.workforce.proficiencyPct)} detail="Billed hours ÷ attendance hours" />
                <MetricCard label="Completed lines" value={number(report.workforce.completedLines)} detail={`${hours(report.workforce.billedHours)} billed · ${hours(report.workforce.jobClockHours)} on jobs`} />
              </div>
              <SectionCard
                eyebrow="Technician evidence"
                title="Output without a simplistic leaderboard"
                detail="Each technician is compared through consistent shop metrics. Zeroes stay visible when the evidence source is missing."
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Technician</th>
                        <th className="px-3 py-2 text-right">Completed</th>
                        <th className="px-3 py-2 text-right">Billed</th>
                        <th className="px-3 py-2 text-right">Job clock</th>
                        <th className="px-3 py-2 text-right">Attendance</th>
                        <th className="px-3 py-2 text-right">Efficiency</th>
                        <th className="px-3 py-2 text-right">Productivity</th>
                        <th className="px-3 py-2 text-right">Proficiency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.workforce.technicians.map((tech) => (
                        <tr key={tech.technicianId} className="bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]">
                          <td className="rounded-l-xl px-3 py-3">
                            <div className="font-semibold">{tech.name}</div>
                            <div className="mt-0.5 text-[10px] text-[color:var(--theme-text-muted)]">{tech.role ?? "Technician"}</div>
                          </td>
                          <td className="px-3 py-3 text-right">{tech.completedLines}</td>
                          <td className="px-3 py-3 text-right">{hours(tech.billedHours)}</td>
                          <td className="px-3 py-3 text-right">{hours(tech.jobClockHours)}</td>
                          <td className="px-3 py-3 text-right">{hours(tech.attendanceHours)}</td>
                          <td className="px-3 py-3 text-right">{metricPct(tech.efficiencyPct)}</td>
                          <td className="px-3 py-3 text-right">{metricPct(tech.productivityPct)}</td>
                          <td className="rounded-r-xl px-3 py-3 text-right">{metricPct(tech.proficiencyPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {report.workforce.technicians.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
                      No technician profiles are available for this shop.
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {section === "quality" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Quote decision rate" value={metricPct(report.quality.approvalRatePct)} detail={`${report.quality.decidedQuoteLines} decisions across ${report.quality.sentQuoteLines} sent lines`} />
                <MetricCard label="Declined / deferred value" value={money(report.quality.declinedDeferredValue, currency)} detail="Value tied to explicit declined or deferred quote decisions" />
                <MetricCard label="Confirmed comebacks" value={report.quality.confirmedComebacks == null ? "Not tracked yet" : number(report.quality.confirmedComebacks)} detail="Generic risk flags are not counted as confirmed rework" />
                <MetricCard label="Data confidence" value={`${report.confidence.score}/100`} detail={`${report.confidence.level} confidence across included evidence`} tone={report.confidence.level === "low" ? "watch" : "default"} />
              </div>
              <SectionCard
                eyebrow="Trust layer"
                title="What this report can—and cannot—prove"
                detail="A first-class report should expose data limits instead of letting AI fill the gaps."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                      Current limitations
                    </div>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      {report.confidence.warnings.map((warning) => (
                        <li key={warning} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">{warning}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      <Gauge className="h-4 w-4 text-emerald-300" />
                      Canonical definitions
                    </div>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      {report.confidence.definitions.map((definition) => (
                        <li key={definition} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">{definition}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !report && !error ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
          No report evidence is available for this period.
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-[10px] text-[color:var(--theme-text-muted)]">
        <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> Technician judgment remains the operational source of truth.</span>
        <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Metrics version: owner_intelligence_v1</span>
      </footer>
    </div>
  );
}
