import type { ReactNode } from "react";

import type {
  DashboardRenderContext,
  DashboardWidgetDefinition,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";

export interface DashboardWidgetModule extends DashboardWidgetDefinition {
  render: (context: DashboardRenderContext, item: DashboardWidgetLayout) => ReactNode;
}
