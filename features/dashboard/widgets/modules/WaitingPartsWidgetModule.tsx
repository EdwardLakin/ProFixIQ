import WaitingPartsWidget from "@/features/dashboard/widgets/WaitingPartsWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const waitingPartsWidgetModule: DashboardWidgetModule = {
  id: "waiting_parts",
  title: "Waiting Parts",
  description: "Blocked by parts availability",
  roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman", "parts", "mechanic", "tech", "technician"],
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  render: (context) => <WaitingPartsWidget shopId={context.shopId} embedded />,
};
