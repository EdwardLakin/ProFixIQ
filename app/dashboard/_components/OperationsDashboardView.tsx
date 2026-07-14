import Link from "next/link";
import { ActivitySquare, AlertTriangle, ArrowRight, ChevronRight, TriangleAlert } from "lucide-react";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";
import { DashboardPanel, DashboardShell, DashboardTopStrip, MetricStrip } from "./DashboardPrimitives";
import { ShopLoadChart } from "./OperationsCharts";
import { OperationalViewSwitcher } from "@/features/dashboard/components/OperationalViewSwitcher";

function EmbeddedEmptyState({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">{label}</div>
      <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{detail}</div>
    </div>
  );
}

function getCountSeverity(count: number): "neutral" | "amber" | "red" {
  if (count > 50) return "red";
  if (count > 20) return "amber";
  return "neutral";
}

export default async function OperationsDashboardView() {
  const payload = await getOperationsDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "Operator";
  const isTechnicianView = payload.viewerScope === "technician";
  const hasTechnicianActivity = payload.technicianActivity.length > 0;
  const hasRightRailSignals = payload.blockerStack.length > 0 || payload.alerts.length > 0 || payload.suggestedActions.length > 0;
  return (
    <DashboardShell>
      <OperationalViewSwitcher role={payload.identity.role} />
      <DashboardTopStrip
        view="operations"
        title={isTechnicianView ? "Technician Dashboard" : "Operations Dashboard"}
        name={`Welcome back, ${displayName}`}
        subtitle={
          isTechnicianView
            ? "Your personal workbench for assigned jobs, blockers, and immediate next actions."
            : "Live command center for active jobs, bottlenecks, and immediate dispatch actions."
        }
        actions={[
          { label: "Create work order", href: "/work-orders/create", tone: "primary" },
          { label: "Work Order Board", href: "/work-orders/board", tone: "secondary" },
        ]}
      />

      <MetricStrip
        className="mb-0"
        items={payload.todayOperations.map((item) => ({
          label: item.label,
          value: item.value,
          tone: Number(item.value) > 0 && ["Waiting for parts", "Completed today"].includes(item.label) ? "accent" : "default",
        }))}
      />

      <DashboardPanel
        title="Immediate Attention"
        eyebrow="Right now"
        action={<Link href="/work-orders/board" className="inline-flex items-center gap-1 text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">Open board <ArrowRight className="h-3 w-3" /></Link>}
        className="border-amber-300/25 bg-[var(--theme-gradient-panel)]"
      >
        {payload.immediateAttention.length > 0 ? (
          <div data-testid="immediate-attention" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {payload.immediateAttention.map((item) => (
              <Link key={item.label} href={item.href ?? "/work-orders/board"} className="group rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 transition hover:border-[var(--brand-accent,#E39A6E)]/50 hover:bg-[color:var(--theme-surface-inset)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                </div>
                <div className="mt-2 text-2xl font-bold text-[var(--brand-accent,#E39A6E)]">{item.value}</div>
              </Link>
            ))}
          </div>
        ) : (
          <EmbeddedEmptyState label="No immediate attention cards" detail="Only active operational issues appear here." />
        )}
      </DashboardPanel>

      <DashboardPanel title="Quick Actions" eyebrow="Operational shortcuts">
        <div data-testid="operations-quick-actions" className="flex flex-wrap gap-2">
          {payload.quickActions.map((action) => (
            <Link key={action.href} href={action.href} className={action.tone === "primary" ? "rounded-lg border border-[var(--brand-accent,#E39A6E)]/45 bg-[var(--brand-accent,#E39A6E)]/15 px-3 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)]" : "rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-inset)]"}>
              {action.label}
            </Link>
          ))}
        </div>
      </DashboardPanel>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.72fr)_minmax(276px,0.9fr)] xl:grid-cols-[minmax(0,1.92fr)_minmax(304px,0.96fr)] 2xl:grid-cols-[minmax(0,2.1fr)_minmax(340px,1fr)]">
        <section className="space-y-2.5">
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
                    className="group flex items-start gap-2 rounded-md border border-amber-500/30 bg-[color:var(--theme-surface-inset)] px-2 py-1.5 transition hover:bg-[color:var(--theme-surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
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
            className="space-y-1.5 rounded-[22px] border border-[color:var(--theme-border-soft)] p-2.5 md:p-2.5"
            style={{
              background: "var(--theme-gradient-panel)",
              boxShadow: "var(--theme-shadow-medium)",
            }}
          >
            <div className="grid gap-1.5 md:grid-cols-[minmax(0,1.56fr)_minmax(232px,0.88fr)] xl:grid-cols-[minmax(0,1.66fr)_minmax(256px,0.94fr)]">
            <DashboardPanel
              title={isTechnicianView ? "My active assigned jobs" : "Live Work Command Surface"}
              className="min-h-[300px] border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]"
              action={<Link href="/work-orders/board" className="inline-flex items-center gap-1 text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">Open board <ArrowRight className="h-3 w-3" /></Link>}
            >
              <div className="grid h-full gap-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="space-y-0.5">
                  {payload.liveWork.length > 0 ? (
                    payload.liveWork.map((item) => (
                      <Link
                        key={item.id}
                        href={`/work-orders/${item.id}`}
                        className="group flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-[0.32rem] text-xs transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/60 hover:bg-[color:var(--theme-surface-inset)] hover:shadow-[var(--theme-shadow-medium)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                      >
                        <div>
                          <div className="font-extrabold tracking-wide text-[color:var(--theme-text-primary)]">{item.label}</div>
                          <div className="text-[color:var(--theme-text-secondary)]">{item.stage}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[color:var(--theme-text-primary)]">P{item.priority}</div>
                          <ChevronRight className="h-3.5 w-3.5 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
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
                        className="group block rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 transition hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-[color:var(--theme-surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[color:var(--theme-text-secondary)]">{row.label}</span>
                          <span className="font-semibold text-[color:var(--theme-text-primary)]">{row.value}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
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

            <DashboardPanel title={isTechnicianView ? "My workload snapshot" : "Active Job Summary"} className="min-h-[300px] border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]">
              <div className="space-y-2">
                {payload.activeJobSummary.map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[color:var(--theme-text-secondary)]">{metric.label}</span>
                      <span className="text-[13px] font-semibold text-[color:var(--theme-text-primary)]">{metric.value}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
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

            <div className="grid gap-1.5 md:grid-cols-[minmax(0,1.56fr)_minmax(232px,0.88fr)] xl:grid-cols-[minmax(0,1.66fr)_minmax(256px,0.94fr)]">
            <DashboardPanel title={isTechnicianView ? "My queue mix" : "Live Shop Load"} className="min-h-[236px] border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]">
              <ShopLoadChart data={payload.liveShopLoad.map((item) => ({ label: item.label, count: item.count }))} />
            </DashboardPanel>

            <DashboardPanel
              title={isTechnicianView ? "My daily summary" : "Today's Operations"}
              className="border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]"
              action={<Link href="/dashboard/bookings" className="text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">Open</Link>}
            >
              <div className="space-y-1.5">
                {payload.dailySummary.map((item) => {
                  const href =
                    item.href
                      ? item.href
                      : item.label === "Today's bookings"
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
                      className="group flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-xs transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-[color:var(--theme-surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                    >
                      <span className="text-[color:var(--theme-text-secondary)]">{item.label}</span>
                      <span className={item.tone === "accent" ? "inline-flex items-center gap-1 font-semibold text-[var(--brand-accent,#E39A6E)]" : "inline-flex items-center gap-1 font-semibold text-[color:var(--theme-text-primary)]"}>
                        {item.value}
                        <ChevronRight className="h-3 w-3 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </DashboardPanel>
          </div>
          </div>

          {hasTechnicianActivity ? (
            <DashboardPanel title={isTechnicianView ? "My activity" : "Technician Activity"} className="min-h-[236px]">
              <div className="space-y-1.5">
                {payload.technicianActivity.map((tech) => (
                  <Link
                    key={tech.id}
                    href="/work-orders/board"
                    className="group grid grid-cols-[minmax(0,1fr)_76px_auto] items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[color:var(--theme-text-primary)]">{tech.name}</div>
                      <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{tech.stage} · {tech.elapsed}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
                        <div className="h-full bg-[var(--brand-accent,#E39A6E)]" style={{ width: `${tech.utilizationPct}%` }} />
                      </div>
                    </div>
                    <div className="text-right text-xs text-[color:var(--theme-text-secondary)]">{tech.activeLines} lines</div>
                    <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--theme-text-secondary)]">
                      Open <ChevronRight className="h-3 w-3 text-[color:var(--theme-text-muted)] transition group-hover:text-[var(--brand-accent,#E39A6E)]" />
                    </div>
                  </Link>
                ))}
              </div>
            </DashboardPanel>
          ) : null}
          <DashboardPanel title="Recent Operational Activity" className="min-h-[180px]">
            <div className="space-y-1.5">
              {payload.recentOperationalActivity.length > 0 ? payload.recentOperationalActivity.map((event) => (
                <Link key={`${event.label}-${event.value}`} href={event.href ?? "/work-orders/board"} className="group flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-xs transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)]">
                  <span className="text-[color:var(--theme-text-primary)]">{event.label}</span>
                  <span className="inline-flex items-center gap-1 text-[color:var(--theme-text-secondary)]">{event.value}<ChevronRight className="h-3 w-3" /></span>
                </Link>
              )) : <EmbeddedEmptyState label="No operational events" detail="Recent events appear when canonical work activity updates." />}
            </div>
          </DashboardPanel>

        </section>

        {hasRightRailSignals ? (
          <aside className="space-y-2 lg:sticky lg:top-2.5 lg:self-start">
            <DashboardPanel
              title="High Impact Alerts"
              action={<Link href="/work-orders/board" className="text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">View all</Link>}
              className="border-red-400/45 bg-[linear-gradient(150deg,rgba(32,10,10,0.64),var(--theme-surface-inset))] shadow-[0_0_0_1px_rgba(239,68,68,0.12)]"
            >
              <div className="space-y-1.5">
                {payload.alerts.map((alert) => (
                  <Link
                    key={alert.label}
                    href={alert.href}
                    className="group block rounded-lg border p-2 transition hover:-translate-y-0.5 hover:brightness-[1.14] hover:shadow-[var(--theme-shadow-medium)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                    style={{
                      borderColor: alert.tone === "critical" ? "rgba(248,113,113,0.7)" : alert.tone === "warning" ? "rgba(251,191,36,0.48)" : "rgba(148,163,184,0.25)",
                      background: alert.tone === "critical" ? "linear-gradient(120deg, rgba(127,29,29,0.48), rgba(69,10,10,0.24))" : alert.tone === "warning" ? "rgba(120,53,15,0.24)" : "var(--theme-surface-inset)",
                      boxShadow: alert.tone === "critical" ? "0 0 0 1px rgba(239,68,68,0.2), inset 0 1px 0 rgba(254,202,202,0.18)" : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[color:var(--theme-text-primary)]">
                      <span className="inline-flex items-center gap-2">
                        {alert.tone === "critical" ? <TriangleAlert className="h-3.5 w-3.5 text-red-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                        {alert.label}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-[color:var(--theme-text-secondary)] transition duration-200 group-hover:translate-x-1 group-hover:scale-110 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                    </div>
                    <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">{alert.detail}</div>
                  </Link>
                ))}
              </div>
            </DashboardPanel>

            <div className="h-px bg-gradient-to-r from-transparent via-[color:var(--theme-surface-subtle)] to-transparent" />

            <DashboardPanel title="Action Rail" eyebrow="Urgency" className="border-amber-300/30 bg-[var(--theme-gradient-panel)]">
              <div className="space-y-1.5">
                {payload.blockerStack.map((blocker) => (
                  (() => {
                    const count = Number.parseInt(blocker.value, 10);
                    const severity = Number.isFinite(count) ? getCountSeverity(count) : "neutral";
                    const valueClass =
                      severity === "red"
                        ? "inline-flex items-center gap-1 font-semibold text-red-300"
                        : severity === "amber"
                          ? "inline-flex items-center gap-1 font-semibold text-amber-300"
                          : blocker.tone === "accent"
                            ? "inline-flex items-center gap-1 font-semibold text-[var(--brand-accent,#E39A6E)]"
                            : "inline-flex items-center gap-1 font-semibold text-[color:var(--theme-text-primary)]";
                    const rowClass =
                      severity === "red"
                        ? "group flex items-center justify-between rounded-lg border border-red-400/35 bg-red-950/20 px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:border-red-300/60 hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50"
                        : severity === "amber"
                          ? "group flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-950/10 px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:border-amber-300/55 hover:bg-amber-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/45"
                          : "group flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-[color:var(--theme-surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60";
                    return (
                      <Link
                        key={blocker.label}
                        href={blocker.href ?? "/work-orders/board"}
                        className={rowClass}
                      >
                        <span className="text-[color:var(--theme-text-secondary)]">{blocker.label}</span>
                        <span className={valueClass}>
                          {blocker.value}
                          <ChevronRight className="h-3 w-3 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                        </span>
                      </Link>
                    );
                  })()
                ))}
              </div>
            </DashboardPanel>
          </aside>
        ) : null}
      </div>
    </DashboardShell>
  );
}
