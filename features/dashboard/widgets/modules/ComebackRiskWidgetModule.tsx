import ComebackRiskWidget from "@/features/dashboard/widgets/ComebackRiskWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const comebackRiskWidgetModule: DashboardWidgetModule = {
  id: "comeback_risk",
  title: "Comeback Risk",
  description: "Potential return work alerts",
  roles: ["owner", "admin", "manager", "advisor"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  render: (context) => <ComebackRiskWidget shopId={context.shopId} embedded compact />,
};
