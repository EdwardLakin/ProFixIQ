import type { ReactNode } from "react";

import type {
  DashboardRenderContext,
  DashboardWidgetDefinition,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";

export interface DashboardWidgetModule extends DashboardWidgetDefinition {
  selfContained?: boolean;
  render: (context: DashboardRenderContext, item: DashboardWidgetLayout) => ReactNode;
}
