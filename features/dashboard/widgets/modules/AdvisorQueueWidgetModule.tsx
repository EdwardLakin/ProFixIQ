import AdvisorQueueWidget from "@/features/work-orders/components/dashboard/AdvisorQueueWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const advisorQueueWidgetModule: DashboardWidgetModule = {
  id: "advisor_queue",
  title: "Advisor Queue",
  description: "Queue and approvals workload",
  roles: ["owner", "admin", "manager", "advisor"],
  defaultW: 4,
  defaultH: 5,
  minW: 3,
  minH: 4,
  render: () => <AdvisorQueueWidget />,
};
