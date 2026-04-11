import { WorkOrderBoardModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const workOrderBoardWidgetModule: DashboardWidgetModule = {
  id: "work_order_board",
  title: "Work Order Board",
  description: "Live workboard snapshot",
  roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
  defaultW: 8,
  defaultH: 5,
  minW: 5,
  minH: 4,
  selfContained: true,
  render: () => <WorkOrderBoardModule mode="feature" />,
};
