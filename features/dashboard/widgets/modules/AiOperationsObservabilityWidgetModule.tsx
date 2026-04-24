import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";
import AiOperationsObservabilityWidget from "@/features/dashboard/widgets/AiOperationsObservabilityWidget";

export const aiOperationsObservabilityWidgetModule: DashboardWidgetModule = {
  id: "ai_operations_observability",
  title: "AI Observability",
  description: "Operational telemetry for recommendation freshness, approvals, and stale expiration health",
  roles: ["owner", "admin", "manager"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: () => <AiOperationsObservabilityWidget />,
};
