import RevenueWatchWidget from "@/features/dashboard/widgets/RevenueWatchWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const revenueWatchWidgetModule: DashboardWidgetModule = {
  id: "revenue_watch",
  title: "Revenue Watch",
  description: "Financial watchpoints",
  roles: ["owner", "admin", "manager"],
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  render: (context) => <RevenueWatchWidget shopId={context.shopId} embedded />,
};
