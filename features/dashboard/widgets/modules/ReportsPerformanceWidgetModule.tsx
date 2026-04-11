import { RevenueWatchModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const reportsPerformanceWidgetModule: DashboardWidgetModule = {
  id: "reports_performance",
  title: "Performance",
  description: "Revenue and team performance",
  roles: ["owner", "admin", "manager"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (context) => <RevenueWatchModule shopId={context.shopId} mode="signal" />,
};
