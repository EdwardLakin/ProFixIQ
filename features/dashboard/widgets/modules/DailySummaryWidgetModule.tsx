import { DailySummaryModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const dailySummaryWidgetModule: DashboardWidgetModule = {
  id: "daily_summary",
  title: "Daily Summary",
  description: "Role-aware operational snapshot",
  roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman", "parts", "mechanic", "tech", "technician"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: () => <DailySummaryModule mode="signal" />,
};
