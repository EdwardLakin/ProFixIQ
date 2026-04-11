import ReportsPerformanceWidget from "@/features/owner/reports/ReportsPerformanceWidget";
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
  render: () => <ReportsPerformanceWidget compact />,
};
