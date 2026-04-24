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
  aiMissionControlWidgetModule,
  aiOperationsObservabilityWidgetModule,
} from "@/features/dashboard/widgets/modules";
import type { DashboardWidgetId } from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const DASHBOARD_WIDGET_REGISTRY: DashboardWidgetModule[] = [
  statsOverviewWidgetModule,
  liveShopLoadWidgetModule,
  dailySummaryWidgetModule,
  workOrderBoardWidgetModule,
  suggestedActionsWidgetModule,
  advisorQueueWidgetModule,
  bookingsWidgetModule,
  shopPulseWidgetModule,
  techLoadWidgetModule,
  technicianPerformanceWidgetModule,
  waitingPartsWidgetModule,
  aiMissionControlWidgetModule,
  aiOperationsObservabilityWidgetModule,
  approvalRiskWidgetModule,
  revenueWatchWidgetModule,
  comebackRiskWidgetModule,
  reportsPerformanceWidgetModule,
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
