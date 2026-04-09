import TechnicianPerformanceWidget from "@/features/dashboard/widgets/TechnicianPerformanceWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const technicianPerformanceWidgetModule: DashboardWidgetModule = {
  id: "tech_performance",
  title: "Technician Performance",
  description: "Completed jobs and average duration today",
  roles: ["owner", "admin", "manager", "advisor", "parts"],
  defaultW: 3,
  defaultH: 4,
  minW: 3,
  minH: 3,
  render: (context) => <TechnicianPerformanceWidget shopId={context.shopId} />,
};
