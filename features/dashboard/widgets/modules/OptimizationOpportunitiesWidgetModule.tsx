import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";
import OptimizationOpportunitiesWidget from "@/features/dashboard/widgets/OptimizationOpportunitiesWidget";

export const optimizationOpportunitiesWidgetModule: DashboardWidgetModule = {
  id: "optimization_opportunities",
  title: "Optimization Opportunities",
  description: "Pricing, inspection, and missed revenue opportunities",
  roles: ["owner", "admin", "manager"],
  defaultW: 6,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (context) => <OptimizationOpportunitiesWidget shopId={context.shopId} compact />,
};
