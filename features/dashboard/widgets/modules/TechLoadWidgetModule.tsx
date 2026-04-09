import TechLoadWidget from "@/features/dashboard/widgets/TechLoadWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const techLoadWidgetModule: DashboardWidgetModule = {
  id: "tech_load",
  title: "Technician Load",
  description: "Current active jobs and load balance",
  roles: ["owner", "admin", "manager", "advisor", "parts"],
  defaultW: 3,
  defaultH: 4,
  minW: 3,
  minH: 3,
  render: (context) => <TechLoadWidget shopId={context.shopId} />,
};
