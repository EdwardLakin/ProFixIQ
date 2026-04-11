import { PerformanceModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const technicianPerformanceWidgetModule: DashboardWidgetModule = {
  id: "tech_performance",
  title: "Technician Performance",
  description: "Completed jobs and average duration today",
  roles: ["owner", "admin", "manager", "advisor", "parts"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (context) => <PerformanceModule shopId={context.shopId} mode="standard" />,
};
