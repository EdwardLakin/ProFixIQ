import { ShopPulseModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const shopPulseWidgetModule: DashboardWidgetModule = {
  id: "shop_pulse",
  title: "Shop Pulse",
  description: "Current shop health snapshot",
  roles: ["owner", "admin", "manager"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (context) => <ShopPulseModule shopId={context.shopId} mode="signal" />,
};
