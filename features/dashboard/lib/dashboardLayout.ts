import type { DashboardRole } from "./dashboardRoles";
import { canViewOwnerWidgets, isAdvisorLikeRole, isTechRole } from "./dashboardRoles";

export type DashboardWidgetKey =
  | "reports_performance"
  | "shop_pulse"
  | "revenue_watch"
  | "approval_risk"
  | "waiting_parts"
  | "tech_load"
  | "comeback_risk"
  | "work_board"
  | "advisor_queue";

export type DashboardLayout = {
  top: DashboardWidgetKey[];
  middle: DashboardWidgetKey[];
  lower: DashboardWidgetKey[];
};

export function getDashboardLayout(role: DashboardRole): DashboardLayout {
  if (isTechRole(role)) {
    return {
      top: [],
      middle: [],
      lower: [],
    };
  }

  if (canViewOwnerWidgets(role)) {
    return {
      top: ["reports_performance", "shop_pulse"],
      middle: ["approval_risk", "waiting_parts", "tech_load"],
      lower: ["work_board", "advisor_queue", "revenue_watch", "comeback_risk"],
    };
  }

  if (isAdvisorLikeRole(role)) {
    return {
      top: ["approval_risk", "waiting_parts"],
      middle: ["work_board", "advisor_queue"],
      lower: ["revenue_watch"],
    };
  }

  return {
    top: ["work_board"],
    middle: [],
    lower: [],
  };
}
