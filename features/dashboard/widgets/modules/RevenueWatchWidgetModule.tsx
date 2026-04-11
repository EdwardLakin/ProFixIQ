import { RevenueWatchModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
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
  selfContained: true,
  render: (context) => <RevenueWatchModule shopId={context.shopId} mode="standard" />,
};
