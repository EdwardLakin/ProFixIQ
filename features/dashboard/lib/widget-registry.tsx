"use client";

import {
  advisorQueueWidgetModule,
  optimizationOpportunitiesWidgetModule,
  approvalRiskWidgetModule,
  bookingsWidgetModule,
  comebackRiskWidgetModule,
  dailySummaryWidgetModule,
  liveShopLoadWidgetModule,
  reportsPerformanceWidgetModule,
  revenueWatchWidgetModule,
  shopPulseWidgetModule,
  statsOverviewWidgetModule,
  suggestedActionsWidgetModule,
  techLoadWidgetModule,
  technicianPerformanceWidgetModule,
  waitingPartsWidgetModule,
  workOrderBoardWidgetModule,
} from "@/features/dashboard/widgets/modules";
import type { DashboardWidgetId } from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const DASHBOARD_WIDGET_REGISTRY: DashboardWidgetModule[] = [
  statsOverviewWidgetModule,
  dailySummaryWidgetModule,
  liveShopLoadWidgetModule,
  suggestedActionsWidgetModule,
  reportsPerformanceWidgetModule,
  shopPulseWidgetModule,
  revenueWatchWidgetModule,
  techLoadWidgetModule,
  technicianPerformanceWidgetModule,
  approvalRiskWidgetModule,
  waitingPartsWidgetModule,
  comebackRiskWidgetModule,
  workOrderBoardWidgetModule,
  bookingsWidgetModule,
  advisorQueueWidgetModule,
  optimizationOpportunitiesWidgetModule,
];

export function getDashboardWidgetRegistry(role: string | null): DashboardWidgetModule[] {
  const normalized = (role ?? "").toLowerCase();
  return DASHBOARD_WIDGET_REGISTRY.filter((widget) =>
    widget.roles.includes(normalized),
  );
}

export function getWidgetById(
  role: string | null,
  id: DashboardWidgetId,
): DashboardWidgetModule | null {
  return getDashboardWidgetRegistry(role).find((widget) => widget.id === id) ?? null;
}

export const ALL_WIDGET_IDS: DashboardWidgetId[] = DASHBOARD_WIDGET_REGISTRY.map(
  (widget) => widget.id,
);
