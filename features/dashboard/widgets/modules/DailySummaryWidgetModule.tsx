import DailySummaryCard from "@/features/shared/components/DailySummaryCard";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const dailySummaryWidgetModule: DashboardWidgetModule = {
  id: "daily_summary",
  title: "Daily Summary",
  description: "Role-aware operational snapshot",
  roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
  defaultW: 4,
  defaultH: 5,
  minW: 3,
  minH: 4,
  render: () => <DailySummaryCard />,
};
