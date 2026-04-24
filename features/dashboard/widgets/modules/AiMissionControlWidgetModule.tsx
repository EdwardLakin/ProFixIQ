import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";
import AiMissionControlWidget from "@/features/dashboard/widgets/AiMissionControlWidget";

export const aiMissionControlWidgetModule: DashboardWidgetModule = {
  id: "ai_mission_control",
  title: "AI Mission Control",
  description: "Top priority operational recommendations across active work orders",
  roles: ["owner", "admin", "manager", "advisor"],
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: () => <AiMissionControlWidget />,
};
