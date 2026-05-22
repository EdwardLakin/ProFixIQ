import { TechLoadModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const techLoadWidgetModule: DashboardWidgetModule = {
  id: "tech_load",
  title: "Technician Load",
  description: "Current active jobs and load balance",
  roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman", "parts"],
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (context) => <TechLoadModule shopId={context.shopId} mode="standard" />,
};
