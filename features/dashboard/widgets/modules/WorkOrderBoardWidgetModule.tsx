import WorkOrderBoardWidget from "@shared/components/workboard/WorkOrderBoardWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const workOrderBoardWidgetModule: DashboardWidgetModule = {
  id: "work_order_board",
  title: "Work Order Board",
  description: "Live workboard snapshot",
  roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
  defaultW: 6,
  defaultH: 6,
  minW: 4,
  minH: 4,
  render: () => <WorkOrderBoardWidget />,
};
