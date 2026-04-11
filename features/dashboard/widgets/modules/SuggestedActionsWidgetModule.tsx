import SuggestedActionsPanel from "@/features/assistant/components/SuggestedActionsPanel";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const suggestedActionsWidgetModule: DashboardWidgetModule = {
  id: "suggested_actions",
  title: "Suggested Actions",
  description: "Highest-value next steps",
  roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  render: (_context, item) => (
    <SuggestedActionsPanel
      context={{ pageType: "dashboard", pageTitle: "Dashboard" }}
      compact={item.h <= 4}
      maxItems={item.h <= 4 ? 3 : 5}
      collapsible={false}
      hideDescription={item.h <= 3}
      embedded
    />
  ),
};
