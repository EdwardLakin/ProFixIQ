import type { ReactNode } from "react";

import type {
  DashboardLayoutItem,
  DashboardRenderContext,
  DashboardWidgetDefinition,
} from "@/features/dashboard/types/layout";

export interface DashboardWidgetModule extends DashboardWidgetDefinition {
  render: (context: DashboardRenderContext, item: DashboardLayoutItem) => ReactNode;
}
