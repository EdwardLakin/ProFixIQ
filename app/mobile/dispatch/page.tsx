import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  RadioTower,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

export const dynamic = "force-dynamic";

export default async function MobileDispatchPage() {
  const payload = await getOperationsDashboardPayload();

  const metrics = [
    {
      label: "Active jobs",
      value: payload.topSummary.activeJobs,
      href: "/mobile/work-orders",
      icon: Wrench,
      tone: "default",
    },
    {
      label: "Blocked",
      value: payload.topSummary.blockedJobs,
      href: "/mobile/work-orders?view=blocked",
      icon: AlertTriangle,
      tone: payload.topSummary.blockedJobs > 0 ? "warning" : "default",
    },
    {
      label: "Techs on shift",
      value: payload.topSummary.techniciansClockedIn,
      href: "/mobile/workforce/attendance",
      icon: Users,
      tone: payload.topSummary.techniciansClockedIn > 0 ? "positive" : "warning",
    },
    {
      label: "Waiting parts",
      value: payload.topSummary.waitingParts,
      href: "/mobile/parts",
      icon: Boxes,
      tone: payload.topSummary.waitingParts > 0 ? "warning" : "default",
    },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <RadioTower aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Dispatch</div>
            <h1 className="mobile-dashboard-hero__title">Live shop floor</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Active work, blockers and technician capacity in one mobile command view.
            </p>
          </div>
        </div>
      </section>

      <section className="mobile-dashboard-metrics" aria-label="Dispatch metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="mobile-dashboard-metric"
              data-tone={metric.tone}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="mobile-dashboard-metric__label">{metric.label}</div>
                <Icon
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-[color:var(--accent-copper)]"
                />
              </div>
              <div className="mobile-dashboard-metric__value">{metric.value}</div>
            </Link>
          );
        })}
      </section>

      <section className="mobile-dashboard-attention">
        <div className="mobile-dashboard-attention__header">
          <h2 className="text-lg font-bold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
            Work in motion
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
            Prioritized by the live operational payload.
          </p>
        </div>

        {payload.liveWork.length > 0 ? (
          <div>
            {payload.liveWork.slice(0, 12).map((item) => (
              <Link
                key={item.id}
                href={`/mobile/work-orders/${item.id}`}
                className="mobile-dashboard-attention__row"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-[color:var(--theme-text-primary)]">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs capitalize text-[color:var(--theme-text-secondary)]">
                    {item.stage.replaceAll("_", " ")}
                  </div>
                </div>
                <ChevronRight
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">
            No active work is available.
          </div>
        )}
      </section>
    </main>
  );
}
