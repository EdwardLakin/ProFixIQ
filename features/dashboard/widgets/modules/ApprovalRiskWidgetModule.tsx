import ApprovalRiskWidget from "@/features/dashboard/widgets/ApprovalRiskWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const approvalRiskWidgetModule: DashboardWidgetModule = {
  id: "approval_risk",
  title: "Approval Risk",
  description: "Work awaiting decision",
  roles: ["owner", "admin", "manager", "advisor"],
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: (context) => <ApprovalRiskWidget shopId={context.shopId} />,
};
