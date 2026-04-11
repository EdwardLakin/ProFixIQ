import LiveShopLoadWidget from "@/features/dashboard/widgets/LiveShopLoadWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const liveShopLoadWidgetModule: DashboardWidgetModule = {
  id: "live_shop_load",
  title: "Live Shop Load",
  description: "Real-time active jobs, tech capacity, and utilization",
  roles: ["owner", "admin", "manager", "advisor", "parts"],
  defaultW: 4,
  defaultH: 4,
  minW: 4,
  minH: 3,
  selfContained: true,
  render: (context) => <LiveShopLoadWidget shopId={context.shopId} />,
};
