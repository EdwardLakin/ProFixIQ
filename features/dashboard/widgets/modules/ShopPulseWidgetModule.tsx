import ShopPulseWidget from "@/features/dashboard/widgets/ShopPulseWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const shopPulseWidgetModule: DashboardWidgetModule = {
  id: "shop_pulse",
  title: "Shop Pulse",
  description: "Current shop health snapshot",
  roles: ["owner", "admin", "manager"],
  defaultW: 3,
  defaultH: 4,
  minW: 3,
  minH: 3,
  render: (context) => <ShopPulseWidget shopId={context.shopId} />,
};
