"use client";

import type { ReactNode } from "react";

import DailySummaryCard from "@/features/shared/components/DailySummaryCard";
import SuggestedActionsPanel from "@/features/assistant/components/SuggestedActionsPanel";
import ReportsPerformanceWidget from "@/features/owner/reports/ReportsPerformanceWidget";
import AdvisorQueueWidget from "@/features/work-orders/components/dashboard/AdvisorQueueWidget";
import WorkOrderBoardWidget from "@shared/components/workboard/WorkOrderBoardWidget";
import BookingsWidget from "@/features/dashboard/widgets/BookingsWidget";
import {
  ShopPulseWidget,
  ApprovalRiskWidget,
  WaitingPartsWidget,
  RevenueWatchWidget,
  TechLoadWidget,
  ComebackRiskWidget,
} from "@/features/dashboard/widgets";
import type {
  DashboardLayoutItem,
  DashboardRenderContext,
  DashboardWidgetDefinition,
  DashboardWidgetId,
} from "@/features/dashboard/types/layout";

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-4"
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 78%, transparent)",
        background:
          "color-mix(in srgb, var(--theme-card-bg,#111827) 84%, black)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
      >
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      <div
        className="mt-1 text-xs"
        style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
      >
        {hint}
      </div>
    </div>
  );
}

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "tech" || r === "mechanic" || r === "technician";
}

function metricTone(kind: "appointments" | "workOrders" | "partsRequests"): string {
  if (kind === "appointments") return "text-sky-300";
  if (kind === "partsRequests") return "text-amber-300";
  return "text-emerald-300";
}

function StatsOverviewWidget({ ctx }: { ctx: DashboardRenderContext }) {
  const tech = isTechRole(ctx.role);

  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
      <MetricCard
        label="Appointments"
        value={ctx.counts.appointments}
        hint={tech ? "Not used for tech view" : "Open bookings in your shop"}
        tone={metricTone("appointments")}
      />
      <MetricCard
        label={tech ? "My active jobs" : "Work orders"}
        value={ctx.counts.workOrders}
        hint={tech ? "Assigned lines still in progress" : "Open work orders in your shop"}
        tone={metricTone("workOrders")}
      />
      <MetricCard
        label={tech ? "My parts requests" : "Parts requests"}
        value={ctx.counts.partsRequests}
        hint={tech ? "Requests tied to you" : "Open parts activity"}
        tone={metricTone("partsRequests")}
      />
      <MetricCard
        label="Role"
        value={0}
        hint={ctx.role ?? "—"}
        tone="text-white"
      />
    </div>
  );
}

export type DashboardWidgetRegistration = DashboardWidgetDefinition & {
  render: (ctx: DashboardRenderContext, item: DashboardLayoutItem) => ReactNode;
};

const REGISTRY: DashboardWidgetRegistration[] = [
  {
    id: "stats_overview",
    title: "Stats Overview",
    description: "Top counts and operational context",
    roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
    defaultW: 6,
    defaultH: 4,
    minW: 4,
    minH: 3,
    render: (ctx) => <StatsOverviewWidget ctx={ctx} />,
  },
  {
    id: "daily_summary",
    title: "Daily Summary",
    description: "Role-aware operational snapshot",
    roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
    defaultW: 4,
    defaultH: 5,
    minW: 3,
    minH: 4,
    render: () => <DailySummaryCard />,
  },
  {
    id: "suggested_actions",
    title: "Suggested Actions",
    description: "Highest-value next steps",
    roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
    defaultW: 4,
    defaultH: 5,
    minW: 3,
    minH: 4,
    render: (_ctx, item) => (
      <SuggestedActionsPanel
        context={{ pageType: "dashboard", pageTitle: "Dashboard" }}
        compact={item.h <= 4}
        maxItems={item.h <= 4 ? 4 : 8}
        collapsible={false}
        hideDescription={item.h <= 3}
      />
    ),
  },
  {
    id: "reports_performance",
    title: "Performance",
    description: "Revenue and team performance",
    roles: ["owner", "admin", "manager"],
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    render: () => <ReportsPerformanceWidget />,
  },
  {
    id: "shop_pulse",
    title: "Shop Pulse",
    description: "Current shop health snapshot",
    roles: ["owner", "admin", "manager"],
    defaultW: 3,
    defaultH: 4,
    minW: 3,
    minH: 3,
    render: (ctx) => <ShopPulseWidget shopId={ctx.shopId} />,
  },
  {
    id: "revenue_watch",
    title: "Revenue Watch",
    description: "Financial watchpoints",
    roles: ["owner", "admin", "manager"],
    defaultW: 3,
    defaultH: 4,
    minW: 3,
    minH: 3,
    render: (ctx) => <RevenueWatchWidget shopId={ctx.shopId} />,
  },
  {
    id: "tech_load",
    title: "Tech Load",
    description: "Current technician balance",
    roles: ["owner", "admin", "manager", "advisor", "parts"],
    defaultW: 3,
    defaultH: 4,
    minW: 3,
    minH: 3,
    render: (ctx) => <TechLoadWidget shopId={ctx.shopId} />,
  },
  {
    id: "approval_risk",
    title: "Approval Risk",
    description: "Work awaiting decision",
    roles: ["owner", "admin", "manager", "advisor"],
    defaultW: 3,
    defaultH: 4,
    minW: 3,
    minH: 3,
    render: (ctx) => <ApprovalRiskWidget shopId={ctx.shopId} />,
  },
  {
    id: "waiting_parts",
    title: "Waiting Parts",
    description: "Blocked by parts availability",
    roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
    defaultW: 3,
    defaultH: 4,
    minW: 3,
    minH: 3,
    render: (ctx) => <WaitingPartsWidget shopId={ctx.shopId} />,
  },
  {
    id: "comeback_risk",
    title: "Comeback Risk",
    description: "Potential return work alerts",
    roles: ["owner", "admin", "manager", "advisor"],
    defaultW: 3,
    defaultH: 4,
    minW: 3,
    minH: 3,
    render: (ctx) => <ComebackRiskWidget shopId={ctx.shopId} />,
  },
  {
    id: "work_order_board",
    title: "Work Order Board",
    description: "Live workboard snapshot",
    roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    render: () => <WorkOrderBoardWidget />,
  },
  {
    id: "bookings",
    title: "Bookings",
    description: "Upcoming appointment activity",
    roles: ["owner", "admin", "manager", "advisor"],
    defaultW: 4,
    defaultH: 5,
    minW: 3,
    minH: 4,
    render: () => <BookingsWidget />,
  },
  {
    id: "advisor_queue",
    title: "Advisor Queue",
    description: "Queue and approvals workload",
    roles: ["owner", "admin", "manager", "advisor"],
    defaultW: 4,
    defaultH: 5,
    minW: 3,
    minH: 4,
    render: () => <AdvisorQueueWidget />,
  },
];

export function getDashboardWidgetRegistry(role: string | null): DashboardWidgetRegistration[] {
  const normalized = (role ?? "").toLowerCase();
  return REGISTRY.filter((item) => item.roles.includes(normalized));
}

export function getWidgetById(
  role: string | null,
  id: DashboardWidgetId,
): DashboardWidgetRegistration | null {
  return getDashboardWidgetRegistry(role).find((item) => item.id === id) ?? null;
}

export const ALL_WIDGET_IDS: DashboardWidgetId[] = REGISTRY.map((item) => item.id);
