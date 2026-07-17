import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Package,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";

import { OperationalViewSwitcher } from "@/features/dashboard/components/OperationalViewSwitcher";
import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";
import { DashboardShell } from "./DashboardPrimitives";

const iconTone = [
  [ClipboardList, "bg-blue-600"],
  [Car, "bg-green-600"],
  [UserRound, "bg-violet-600"],
  [Wrench, "bg-orange-600"],
  [UsersRound, "bg-teal-600"],
] as const;

function panelClass(className = "") {
  return `rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] ${className}`;
}

function attentionContext(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("part"))
    return { context: "Parts on order", action: "Review parts" };
  if (normalized.includes("technician"))
    return { context: "Available now", action: "Assign job" };
  if (normalized.includes("customer"))
    return { context: "Front desk", action: "Notify advisor" };
  if (normalized.includes("approval"))
    return { context: "Customer decision", action: "Review approval" };
  if (normalized.includes("long-running"))
    return { context: "Active bay", action: "Review job" };
  return { context: "Workflow blocked", action: "Review work" };
}

export default async function OperationsDashboardView() {
  const payload = await getOperationsDashboardPayload();
  const isTechnicianView = payload.viewerScope === "technician";
  const waiterSignal = payload.immediateAttention.find((item) =>
    item.label.toLowerCase().includes("customer"),
  );
  const metrics = [
    ...payload.todayOperations.slice(0, 4),
    {
      label: "Customers waiting",
      value: waiterSignal?.value ?? "0",
      href: "/work-orders/board",
    },
  ];
  const pulse = [
    {
      label: "Appointments today",
      value: payload.topSummary.appointmentsToday,
      icon: CalendarDays,
      href: "/dashboard/bookings",
    },
    {
      label: "Approvals pending",
      value: payload.topSummary.waitingApprovals,
      icon: ShieldCheck,
      href: "/work-orders/board?stage=awaiting_approval",
    },
    {
      label: "Parts requests open",
      value: payload.topSummary.waitingParts,
      icon: Package,
      href: "/parts/requests",
    },
    {
      label: "Jobs completed today",
      value: payload.topSummary.completedToday,
      icon: CheckCircle2,
      href: "/work-orders/board?stage=completed",
    },
  ];
  const flow = [
    [
      "Awaiting",
      payload.flowMix.find((item) => item.label.toLowerCase() === "awaiting")
        ?.value ?? 0,
      "awaiting",
    ],
    [
      "In progress",
      payload.flowMix.find((item) => item.label.toLowerCase() === "in progress")
        ?.value ?? 0,
      "in_progress",
    ],
    [
      "Awaiting approval",
      payload.topSummary.waitingApprovals,
      "awaiting_approval",
    ],
    ["Waiting parts", payload.topSummary.blockedJobs, "waiting_parts"],
    ["Ready to invoice", payload.topSummary.completedToday, "completed"],
  ] as const;

  return (
    <DashboardShell>
      <OperationalViewSwitcher role={payload.identity.role} />

      <header className="flex flex-col gap-4 px-1 py-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--theme-text-primary)]">
            {isTechnicianView ? "Technician Overview" : "Shop Overview"}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)]">
            <span>
              {new Intl.DateTimeFormat("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date())}
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Live operations</span>
          </div>
        </div>
        <Link
          href="/work-orders/create"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary,#C1663B)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Create work order
        </Link>
      </header>

      {payload.sectionErrors.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          {payload.sectionErrors.join(" ")}
        </div>
      ) : null}

      <section
        className={`${panelClass("p-3")} grid gap-2 sm:grid-cols-2 lg:grid-cols-5`}
      >
        {metrics.map((item, index) => {
          const [Icon, tone] = iconTone[index];
          return (
            <Link
              key={item.label}
              href={item.href ?? "/work-orders/board"}
              className="group flex min-h-20 items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 transition hover:border-[var(--brand-accent,#E39A6E)]/55"
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ${tone}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-[color:var(--theme-text-secondary)]">
                  {item.label}
                </span>
                <span className="block text-2xl font-bold text-[color:var(--theme-text-primary)]">
                  {item.value}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,0.95fr)]">
        <div className="space-y-3">
          <section className={panelClass("overflow-hidden")}>
            <div className="p-4">
              <h2 className="text-xl font-bold text-[color:var(--theme-text-primary)]">
                Needs attention
              </h2>
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                Top items requiring focus
              </p>
            </div>
            {payload.immediateAttention.length ? (
              <div
                data-testid="immediate-attention"
                className="divide-y divide-[color:var(--theme-border-soft)] border-y border-[color:var(--theme-border-soft)]"
              >
                {payload.immediateAttention.slice(0, 5).map((item, index) => {
                  const meta = attentionContext(item.label);
                  return (
                    <div
                      key={item.label}
                      className="grid gap-3 border-l-4 border-l-[var(--brand-accent,#E39A6E)] px-4 py-3 sm:grid-cols-[48px_minmax(0,1.4fr)_minmax(120px,0.8fr)_auto] sm:items-center"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-accent,#E39A6E)]/15 font-bold text-[var(--brand-primary,#C1663B)]">
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-semibold text-[color:var(--theme-text-primary)]">
                          <span className="mr-1 text-lg">{item.value}</span>
                          {item.label}
                        </div>
                        <div className="text-xs text-[color:var(--theme-text-muted)]">
                          Operational priority
                        </div>
                      </div>
                      <div className="text-sm text-[color:var(--theme-text-secondary)]">
                        <div>{meta.context}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--brand-primary,#C1663B)]">
                          <Clock3 className="h-3.5 w-3.5" />
                          Waiting now
                        </div>
                      </div>
                      <Link
                        href={item.href ?? "/work-orders/board"}
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
                      >
                        {meta.action}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border-y border-[color:var(--theme-border-soft)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
                No urgent operational items right now.
              </div>
            )}
            <Link
              href="/work-orders/board"
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--brand-primary,#C1663B)]"
            >
              View all needs <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section className={panelClass("p-4")}>
            <h2 className="text-lg font-bold text-[color:var(--theme-text-primary)]">
              Work in motion
            </h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Jobs by current stage
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {flow.map(([label, value, stage], index) => (
                <Link
                  key={label}
                  href={`/work-orders/board?stage=${stage}`}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 transition hover:border-[var(--brand-accent,#E39A6E)]/55"
                >
                  <div className="flex items-center justify-between text-sm text-[color:var(--theme-text-secondary)]">
                    <span>{label}</span>
                    {index < flow.length - 1 ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : null}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[color:var(--theme-text-primary)]">
                    {value}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-inset)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand-primary,#C1663B)]"
                      style={{ width: `${Math.min(100, Number(value) * 20)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <section className={panelClass("p-4")}>
            <h2 className="text-xl font-bold text-[color:var(--theme-text-primary)]">
              Today&apos;s pulse
            </h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Live snapshot of key activity
            </p>
            <div className="mt-3 space-y-2">
              {pulse.map(({ label, value, icon: Icon, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2.5"
                >
                  <Icon className="h-5 w-5 text-[var(--brand-primary,#C1663B)]" />
                  <span className="flex-1 text-sm text-[color:var(--theme-text-secondary)]">
                    {label}
                  </span>
                  <strong className="text-xl text-[color:var(--theme-text-primary)]">
                    {value}
                  </strong>
                </Link>
              ))}
            </div>
          </section>

          <section className={panelClass("p-4")}>
            <h2 className="text-xl font-bold text-[color:var(--theme-text-primary)]">
              Action rail
            </h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Shortcuts to keep operations moving
            </p>
            <div className="mt-3 space-y-2">
              {payload.suggestedActions.map((action, index) => {
                const Icon = [UsersRound, Package, ClipboardList][index % 3];
                return (
                  <Link
                    key={`${action.label}-${action.href}`}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2.5"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand-primary,#C1663B)]/12 text-[var(--brand-primary,#C1663B)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {action.label}
                      </span>
                      <span className="block truncate text-xs text-[color:var(--theme-text-muted)]">
                        {action.detail}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className={panelClass("overflow-hidden p-4 pb-0")}>
            <h2 className="text-xl font-bold text-[color:var(--theme-text-primary)]">
              Technician capacity
            </h2>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Today&apos;s availability
            </p>
            <div className="mt-3 space-y-2">
              {payload.technicianActivity.length ? (
                payload.technicianActivity.slice(0, 3).map((tech) => (
                  <div
                    key={tech.id}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] p-3"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--theme-surface-subtle)] text-sm font-bold">
                      {tech.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {tech.name}
                      </span>
                      <span className="text-xs text-[color:var(--theme-text-muted)]">
                        {tech.activeLines
                          ? `${tech.activeLines} active lines`
                          : "Available · no active job"}
                      </span>
                    </span>
                    <Link
                      href="/work-orders/board"
                      className="rounded-lg border border-[var(--brand-primary,#C1663B)]/45 px-3 py-2 text-xs font-semibold"
                    >
                      {tech.activeLines ? "View" : "Assign job"}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[color:var(--theme-border-soft)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
                  No technician activity is available.
                </div>
              )}
            </div>
            <Link
              href="/dashboard/workforce/attendance"
              className="mt-3 flex items-center justify-center gap-2 border-t border-[color:var(--theme-border-soft)] py-3 text-sm font-semibold text-[var(--brand-primary,#C1663B)]"
            >
              View all technicians <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </aside>
      </div>
    </DashboardShell>
  );
}
