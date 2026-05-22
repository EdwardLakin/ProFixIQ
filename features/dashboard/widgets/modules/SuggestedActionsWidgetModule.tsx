import { SuggestedActionsModule } from "@/features/dashboard/widgets/modules/RefinedDashboardModules";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const suggestedActionsWidgetModule: DashboardWidgetModule = {
  id: "suggested_actions",
  title: "Suggested Actions",
  description: "Highest-value next steps",
  roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman", "parts", "mechanic", "tech", "technician"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (_context, item) => <SuggestedActionsModule mode="standard" maxItems={item.h <= 4 ? 3 : 5} />,
};
