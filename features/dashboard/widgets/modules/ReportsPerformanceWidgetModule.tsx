import ReportsPerformanceWidget from "@/features/owner/reports/ReportsPerformanceWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const reportsPerformanceWidgetModule: DashboardWidgetModule = {
  id: "reports_performance",
  title: "Performance",
  description: "Revenue and team performance",
  roles: ["owner", "admin", "manager"],
  defaultW: 6,
  defaultH: 5,
  minW: 4,
  minH: 4,
  selfContained: true,
  render: () => <ReportsPerformanceWidget />,
};
