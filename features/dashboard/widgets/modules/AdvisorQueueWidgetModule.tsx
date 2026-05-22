import { WorkOrderBoardModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const advisorQueueWidgetModule: DashboardWidgetModule = {
  id: "advisor_queue",
  title: "Advisor Queue",
  description: "Queue and approvals workload",
  roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman"],
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: () => <WorkOrderBoardModule mode="standard" />,
};
