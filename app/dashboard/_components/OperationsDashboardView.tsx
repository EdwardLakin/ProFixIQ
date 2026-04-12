import Link from "next/link";
import { ActivitySquare, AlertTriangle, ArrowRight, ChevronRight, TriangleAlert } from "lucide-react";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";
import { ActionRow, CompactSignalList, DashboardPanel, DashboardShell, DashboardTopStrip, MetricStrip } from "./DashboardPrimitives";
import { ShopLoadChart } from "./OperationsCharts";

function EmbeddedEmptyState({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/15 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{label}</div>
      <div className="mt-1 text-xs text-neutral-500">{detail}</div>
    </div>
  );
}

export default async function OperationsDashboardView() {
  const payload = await getOperationsDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "Operator";
  const hasTechnicianActivity = payload.technicianActivity.length > 0;
  const hasRightRailSignals = payload.blockerStack.length > 0 || payload.alerts.length > 0 || payload.suggestedActions.length > 0;

  const alertHrefByLabel: Record<string, string> = {
    "Blocked jobs climbing": "/work-orders/board?stage=on_hold",
    "Approval queue aging": "/work-orders/board?stage=awaiting_approval",
    "Parts constraints active": "/parts/requests",
    "Blocker pressure stable": "/work-orders/board",
    "Approval queue healthy": "/work-orders/board?stage=awaiting_approval",
    "No parts constraints": "/parts/requests",
  };

  const blockerHrefByLabel: Record<string, string> = {
    "Approvals pending": "/work-orders/board?stage=awaiting_approval",
    "Waiting parts": "/parts/requests",
    "On hold / blocked": "/work-orders/board?stage=on_hold",
  };

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="operations"
        title="Operations Dashboard"
        name={`Welcome back, ${displayName}`}
        subtitle="Live command center for active jobs, bottlenecks, and immediate dispatch actions."
        actions={[
          { label: "Create work order", href: "/work-orders/create", tone: "primary" },
          { label: "Dispatch", href: "/dashboard/manager/dispatch", tone: "secondary" },
        ]}
      />

      <MetricStrip
        className="mb-0.5"
        items={[
          { label: "Active jobs", value: String(payload.topSummary.activeJobs) },
          { label: "Blocked", value: String(payload.topSummary.blockedJobs), tone: payload.topSummary.blockedJobs > 0 ? "accent" : "default" },
          { label: "Approvals", value: String(payload.topSummary.waitingApprovals), tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default" },
          { label: "Waiting parts", value: String(payload.topSummary.waitingParts), tone: payload.topSummary.waitingParts > 0 ? "accent" : "default" },
        ]}
      />

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.95fr)_minmax(300px,1fr)] 2xl:grid-cols-[minmax(0,2.08fr)_minmax(320px,1fr)]">
        <section className="space-y-3">
          {payload.sectionErrors.length > 0 ? (
            <section className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-transparent px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                <ActivitySquare className="h-3.5 w-3.5" />
                Section warnings
              </div>
              <div className="space-y-1 text-xs text-amber-200">
                {payload.sectionErrors.map((warning) => (
                  <Link
                    key={warning}
                    href="/dashboard/operations"
                    className="group flex items-start gap-2 rounded-md border border-amber-500/30 bg-black/25 px-2 py-1.5 transition hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3" />
                    <span className="flex-1">{warning}</span>
                    <ChevronRight className="mt-0.5 h-3 w-3 text-amber-200/70 transition group-hover:text-amber-100" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div
            className="space-y-1.5 rounded-[22px] border border-white/5 p-2.5 md:p-3"
            style={{
              background: "linear-gradient(158deg, rgba(4,8,20,0.92), rgba(8,14,30,0.78) 48%, rgba(4,10,24,0.86))",
              boxShadow: "inset 0 1px 0 rgba(148,163,184,0.06), 0 16px 28px rgba(0,0,0,0.24)",
            }}
          >
            <div className="grid gap-1.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(248px,0.9fr)]">
            <DashboardPanel
              title="Live Work Command Surface"
              className="min-h-[330px] border-white/5 bg-[linear-gradient(155deg,rgba(7,13,28,0.9),rgba(8,14,30,0.78))]"
              action={<Link href="/work-orders/board" className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white">Open board <ArrowRight className="h-3 w-3" /></Link>}
            >
              <div className="grid h-full gap-2.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="space-y-1">
                  {payload.liveWork.length > 0 ? (
                    payload.liveWork.map((item) => (
                      <Link
                        key={item.id}
                        href={`/work-orders/${item.id}`}
                        className="group flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/60 hover:bg-black/45 hover:shadow-[0_0_0_1px_rgba(227,154,110,0.2),0_8px_20px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                      >
                        <div>
                          <div className="font-bold tracking-wide text-white">{item.label}</div>
                          <div className="text-neutral-400">{item.stage}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="rounded-full border border-white/10 px-2 py-0.5 text-neutral-200">P{item.priority}</div>
                          <ChevronRight className="h-3.5 w-3.5 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                        </div>
                      </Link>
                    ))
                  ) : (
                    <EmbeddedEmptyState
                      label="Live work idle"
                      detail="No active jobs are currently in motion."
                    />
                  )}
                </div>
                <div className="space-y-1">
                  {payload.flowMix.length > 0 ? (
                    payload.flowMix.map((row) => (
                      <Link
                        key={row.label}
                        href={`/work-orders/board?stage=${encodeURIComponent(row.label.toLowerCase().replaceAll(" ", "_"))}`}
                        className="group block rounded-lg border border-white/8 bg-black/20 p-2 transition hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-300">{row.label}</span>
                          <span className="font-semibold text-white">{row.value}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--brand-primary,#C1663B)] to-[var(--brand-accent,#E39A6E)]"
                            style={{ width: `${Math.min(100, row.value * 12)}%` }}
                          />
                        </div>
                      </Link>
                    ))
                  ) : (
                    <EmbeddedEmptyState
                      label="Flow signal pending"
                      detail="Stage mix will appear as work transitions through the board."
                    />
                  )}
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel title="Active Job Summary" className="min-h-[330px] border-white/5 bg-[linear-gradient(155deg,rgba(7,12,25,0.84),rgba(8,14,29,0.74))]">
              <div className="space-y-2.5">
                {payload.activeJobSummary.map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-white/5 bg-black/15 p-2.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">{metric.label}</span>
                      <span className="text-[13px] font-semibold text-neutral-100">{metric.value}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[var(--brand-accent,#E39A6E)]"
                        style={{ width: `${metric.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </DashboardPanel>
          </div>

            <div className="grid gap-1.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(248px,0.9fr)]">
            <DashboardPanel title="Live Shop Load" className="min-h-[252px] border-white/5 bg-[linear-gradient(155deg,rgba(7,12,25,0.84),rgba(8,14,29,0.74))]">
              <ShopLoadChart data={payload.liveShopLoad.map((item) => ({ label: item.label, count: item.count }))} />
            </DashboardPanel>

            <DashboardPanel
              title="Daily Summary"
              className="border-white/5 bg-[linear-gradient(155deg,rgba(7,12,25,0.84),rgba(8,14,29,0.74))]"
              action={<Link href="/dashboard/bookings" className="text-xs text-neutral-300 hover:text-white">Open</Link>}
            >
              <div className="space-y-1.5">
                {payload.dailySummary.map((item) => {
                  const href =
                    item.label === "Today's bookings"
                      ? "/dashboard/bookings"
                      : item.label === "Approval queue"
                        ? "/work-orders/board?stage=awaiting_approval"
                        : item.label === "Parts waiting"
                          ? "/parts/requests"
                          : "/work-orders/board";
                  return (
                    <Link
                      key={`${item.label}-${item.value}`}
                      href={href}
                      className="group flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                    >
                      <span className="text-neutral-300">{item.label}</span>
                      <span className={item.tone === "accent" ? "inline-flex items-center gap-1 font-semibold text-[var(--brand-accent,#E39A6E)]" : "inline-flex items-center gap-1 font-semibold text-white"}>
                        {item.value}
                        <ChevronRight className="h-3 w-3 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </DashboardPanel>
          </div>
          </div>

          {hasTechnicianActivity ? (
            <DashboardPanel title="Technician Activity" className="min-h-[236px]">
              <div className="space-y-1.5">
                {payload.technicianActivity.map((tech) => (
                  <Link
                    key={tech.id}
                    href="/dashboard/manager/dispatch"
                    className="group grid grid-cols-[minmax(0,1fr)_76px_auto] items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 transition hover:border-white/20 hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{tech.name}</div>
                      <div className="text-[11px] text-neutral-400">{tech.stage} · {tech.elapsed}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-[var(--brand-accent,#E39A6E)]" style={{ width: `${tech.utilizationPct}%` }} />
                      </div>
                    </div>
                    <div className="text-right text-xs text-neutral-300">{tech.activeLines} lines</div>
                    <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-300">
                      Open <ChevronRight className="h-3 w-3 text-neutral-500 transition group-hover:text-[var(--brand-accent,#E39A6E)]" />
                    </div>
                  </Link>
                ))}
              </div>
            </DashboardPanel>
          ) : null}

          <DashboardPanel
            title="Revenue & Efficiency Snapshot"
            action={<Link href="/dashboard/performance" className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white">Open <ArrowRight className="h-3 w-3" /></Link>}
          >
            <div className="grid gap-2 md:grid-cols-[minmax(180px,0.8fr)_minmax(0,1fr)]">
              <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Revenue (MTD)</div>
                <div className="mt-1 text-xl font-semibold text-white">${payload.revenueEfficiency.revenue.toLocaleString()}</div>
              </div>
              <CompactSignalList
                items={[
                  { label: "Profit", value: `$${payload.revenueEfficiency.profit.toLocaleString()}` },
                  { label: "Efficiency", value: `${payload.revenueEfficiency.efficiencyPct}%` },
                  { label: "Active lines", value: String(payload.revenueEfficiency.completedLines) },
                ]}
              />
            </div>
          </DashboardPanel>
        </section>

        {hasRightRailSignals ? (
          <aside className="space-y-2.5 xl:sticky xl:top-3 xl:self-start">
            <DashboardPanel
              title="High Impact Alerts"
              action={<Link href="/work-orders/board" className="text-xs text-neutral-300 hover:text-white">View all</Link>}
              className="border-red-400/45 bg-[linear-gradient(150deg,rgba(32,10,10,0.64),rgba(12,9,16,0.86))] shadow-[0_0_0_1px_rgba(239,68,68,0.12)]"
            >
              <div className="space-y-1.5">
                {payload.alerts.map((alert) => (
                  <Link
                    key={alert.label}
                    href={alertHrefByLabel[alert.label] ?? "/work-orders/board"}
                    className="group block rounded-lg border p-2 transition hover:-translate-y-px hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                    style={{
                      borderColor: alert.tone === "critical" ? "rgba(248,113,113,0.7)" : alert.tone === "warning" ? "rgba(251,191,36,0.48)" : "rgba(148,163,184,0.25)",
                      background: alert.tone === "critical" ? "linear-gradient(120deg, rgba(127,29,29,0.48), rgba(69,10,10,0.24))" : alert.tone === "warning" ? "rgba(120,53,15,0.24)" : "rgba(15,23,42,0.5)",
                      boxShadow: alert.tone === "critical" ? "0 0 0 1px rgba(239,68,68,0.2), inset 0 1px 0 rgba(254,202,202,0.18)" : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-white">
                      <span className="inline-flex items-center gap-2">
                        {alert.tone === "critical" ? <TriangleAlert className="h-3.5 w-3.5 text-red-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                        {alert.label}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-300">{alert.detail}</div>
                  </Link>
                ))}
              </div>
            </DashboardPanel>

            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <DashboardPanel title="Action Rail" eyebrow="Urgency" className="border-amber-300/30 bg-[linear-gradient(150deg,rgba(36,22,8,0.42),rgba(8,11,24,0.84))]">
              <div className="space-y-1.5">
                {payload.blockerStack.map((blocker) => (
                  <Link
                    key={blocker.label}
                    href={blockerHrefByLabel[blocker.label] ?? "/work-orders/board"}
                    className="group flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                  >
                    <span className="text-neutral-300">{blocker.label}</span>
                    <span className={blocker.tone === "accent" ? "inline-flex items-center gap-1 font-semibold text-[var(--brand-accent,#E39A6E)]" : "inline-flex items-center gap-1 font-semibold text-white"}>
                      {blocker.value}
                      <ChevronRight className="h-3 w-3 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                    </span>
                  </Link>
                ))}
              </div>
            </DashboardPanel>

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <DashboardPanel title="Suggested Actions" className="border-white/10 bg-[linear-gradient(150deg,rgba(2,6,23,0.7),rgba(7,10,18,0.6))]">
              <ActionRow actions={payload.suggestedActions} emphasis="subtle" />
            </DashboardPanel>
          </aside>
        ) : null}
      </div>
    </DashboardShell>
  );
}
