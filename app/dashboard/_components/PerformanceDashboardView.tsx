import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Clock3, Info } from "lucide-react";

import { getPerformanceDashboardPayload } from "@/features/dashboard/server/getPerformanceDashboardPayload";
import {
  DashboardPanel,
  DashboardShell,
  DashboardTopStrip,
  MetricStrip,
} from "./DashboardPrimitives";
import PerformanceTrendPanel from "./PerformanceTrendPanel";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function metricPct(value: number | null): string {
  return value == null ? "N/A" : `${value.toFixed(1)}%`;
}

function FocusIcon({ severity }: { severity: "positive" | "watch" | "critical" | "info" }) {
  if (severity === "positive") return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (severity === "critical") return <AlertTriangle className="h-4 w-4 text-red-300" />;
  if (severity === "watch") return <Clock3 className="h-4 w-4 text-amber-300" />;
  return <Info className="h-4 w-4 text-sky-300" />;
}

export default async function PerformanceDashboardView() {
  const payload = await getPerformanceDashboardPayload();
  const report = payload.report;
  const displayName = payload.identity.fullName?.trim() || "Operator";

  if (!report) {
    return (
      <DashboardShell>
        <DashboardTopStrip
          view="performance"
          title="Performance Dashboard"
          name={`Executive review, ${displayName}`}
          subtitle="Verified owner intelligence is unavailable."
          actions={[
            { label: "Full reports", href: "/dashboard/owner/reports", tone: "primary" },
          ]}
        />
        <DashboardPanel eyebrow="Report unavailable" title="Performance data could not be built">
          <div className="space-y-2 text-xs text-amber-200">
            {payload.sectionErrors.map((warning) => (
              <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {warning}
              </div>
            ))}
          </div>
        </DashboardPanel>
      </DashboardShell>
    );
  }

  const trend = report.trend.map((point) => ({
    label: point.label,
    revenue: point.revenue,
    jobs: point.issuedInvoices,
    knownContribution: point.knownContribution,
  }));
  const delayHours =
    report.workflow.awaitingApprovalHours +
    report.workflow.waitingForPartsHours +
    report.workflow.onHoldHours +
    report.workflow.readyToInvoiceHours;
  const currency = report.shop.currency;

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="performance"
        title="Performance Dashboard"
        name={`Executive review, ${displayName}`}
        subtitle="This month to date: issued revenue, known contribution, measured delay, and technician output."
        actions={[
          { label: "Owner intelligence", href: "/dashboard/owner/reports", tone: "primary" },
          { label: "Workforce", href: "/dashboard/workforce/attendance", tone: "secondary" },
        ]}
      />

      <MetricStrip
        items={[
          {
            label: "Issued revenue",
            value: money(report.financial.issuedRevenue.current, currency),
            indicator:
              (report.financial.issuedRevenue.deltaPct ?? 0) < 0 ? "amber" : "accent",
          },
          {
            label: "Known contribution",
            value: money(report.financial.knownContribution.current, currency),
            indicator:
              report.financial.costCoveragePct < 80 ? "amber" : "accent",
          },
          {
            label: "Issued invoices",
            value: String(report.financial.issuedInvoices.current),
            indicator: "accent",
          },
          {
            label: "Average RO",
            value: money(report.financial.averageRepairOrder.current, currency),
            indicator: "accent",
          },
          {
            label: "Efficiency",
            value: metricPct(report.workforce.efficiencyPct),
          },
          {
            label: "Productivity",
            value: metricPct(report.workforce.productivityPct),
          },
          {
            label: "Open delay",
            value: `${delayHours.toFixed(1)}h`,
            indicator: delayHours > 0 ? "amber" : "accent",
            pulse: delayHours >= 24,
          },
          {
            label: "Data confidence",
            value: `${report.confidence.score}/100`,
            indicator: report.confidence.level === "low" ? "amber" : "accent",
          },
        ]}
      />

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
        <DashboardPanel
          eyebrow="Verified period trend"
          title="Issued revenue and known contribution"
          action={
            <Link href="/dashboard/owner/reports?section=financial" className="inline-flex items-center gap-1 text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">
              Financial detail <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <PerformanceTrendPanel data={trend} heightClassName="h-[220px] lg:h-[250px]" />
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--theme-text-muted)]">
            Invoice placement uses the invoice issue date, not import time. The contribution line subtracts only recorded costs and expenses.
          </p>
        </DashboardPanel>

        <DashboardPanel eyebrow="AI-assisted brief" title="Executive summary">
          <div className="rounded-xl border border-orange-300/20 bg-[color:var(--theme-surface-inset)] p-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">
              <Bot className="h-4 w-4" />
              Evidence-bound explanation
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--theme-text-primary)]">
              {report.executiveSummary.text ??
                "Open Owner Intelligence to generate the weekly or monthly executive summary from this verified snapshot."}
            </p>
          </div>
          <Link href="/dashboard/owner/reports" className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-orange-300/30 bg-orange-400/10 px-3 text-xs font-semibold text-orange-200 hover:bg-orange-400/20">
            Open full intelligence <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </DashboardPanel>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <DashboardPanel eyebrow="Immediate focus" title="What deserves attention">
          <div className="space-y-1.5">
            {report.focus.map((item) => (
              <Link key={item.id} href={item.href} className="flex items-start gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5 hover:border-orange-300/40">
                <FocusIcon severity={item.severity} />
                <div>
                  <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">{item.title}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--theme-text-secondary)]">{item.detail}</div>
                </div>
              </Link>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel eyebrow="Measured workflow" title="Open delay by current stage">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["Approval", report.workflow.awaitingApprovalHours, report.workflow.awaitingApprovalCount],
              ["Parts", report.workflow.waitingForPartsHours, report.workflow.waitingForPartsCount],
              ["On hold", report.workflow.onHoldHours, report.workflow.onHoldWorkOrders],
              ["Ready to invoice", report.workflow.readyToInvoiceHours, report.workflow.readyToInvoiceCount],
            ].map(([label, hours, count]) => (
              <div key={String(label)} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">{label}</div>
                <div className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">{Number(hours).toFixed(1)}h</div>
                <div className="text-[10px] text-[color:var(--theme-text-secondary)]">{count} work orders</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[color:var(--theme-text-muted)]">
            These are current work-order stage hours, not additive employee idle hours.
          </p>
        </DashboardPanel>
      </div>
    </DashboardShell>
  );
}
