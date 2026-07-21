import "server-only";

import type { ShopAssistantState } from "@/features/shop-assistant/server/state/types";
import type { ShopAssistantIntentClassification } from "./types";

const SHOP_STATE_QUESTION_PATTERN =
  /\b(?:status|summary|priorit|focus|attention|today|how(?:'s| is)|overview|current|what changed|what needs|shop picture|operations|everything|all departments)\b/i;

function relevantAlertCodes(
  classification: ShopAssistantIntentClassification,
): (code: string) => boolean {
  switch (classification.agentId) {
    case "work_orders_agent":
      return (code) =>
        code.includes("work_order") ||
        code.includes("approval") ||
        code.includes("active_job");
    case "inventory_agent":
      return (code) => code.includes("part");
    case "invoices_agent":
      return (code) => code.includes("invoice");
    case "workforce_agent":
      return (code) =>
        code.includes("tech") ||
        code.includes("shop_overloaded") ||
        code.includes("throughput");
    case "scheduling_agent":
      return (code) => code.includes("booking") || code.includes("schedule");
    default:
      return () => true;
  }
}

export function shouldUseShopState(
  question: string,
  classification: ShopAssistantIntentClassification,
): boolean {
  if (
    classification.agentId === "customers_agent" ||
    classification.agentId === "customer_communications_agent" ||
    classification.agentId === "inspections_agent" ||
    classification.agentId === "business_analytics_agent" ||
    classification.agentId === "diagnostic_boundary_agent"
  ) {
    return false;
  }

  return (
    SHOP_STATE_QUESTION_PATTERN.test(question) ||
    classification.reason === "matched a cross-domain shop summary request"
  );
}

export function buildStateGroundedAnswer(params: {
  question: string;
  state: ShopAssistantState;
  classification: ShopAssistantIntentClassification;
}): string | null {
  if (!shouldUseShopState(params.question, params.classification)) return null;

  const metrics = params.state.metrics;
  const lines: string[] = [];
  if (params.classification.agentId === "work_orders_agent") {
    lines.push(
      `${metrics.openWorkOrders} work order(s) are open; ${metrics.stalledWorkOrders} are stalled and ${metrics.overdueApprovals} have overdue approval signals.`,
    );
  } else if (params.classification.agentId === "inventory_agent") {
    lines.push(`${metrics.delayedParts} delayed-parts signal(s) are active.`);
  } else if (params.classification.agentId === "invoices_agent") {
    lines.push(`${metrics.readyToInvoice} work order(s) are ready for invoice review.`);
  } else if (params.classification.agentId === "workforce_agent") {
    lines.push(
      `Shop utilization is ${metrics.shopUtilizationPct}% with ${metrics.idleTechnicians} shifted technician(s) currently available.`,
    );
  } else if (params.classification.agentId === "scheduling_agent") {
    lines.push(`${metrics.todaysBookings} appointment(s) are in the current shop-day view.`);
  } else {
    lines.push(params.state.headline);
    lines.push(
      `${metrics.openWorkOrders} open work orders • ${metrics.stalledWorkOrders} stalled • ${metrics.overdueApprovals} overdue approvals • ${metrics.delayedParts} delayed parts • ${metrics.readyToInvoice} ready to invoice • ${metrics.idleTechnicians} available technicians.`,
    );
  }

  const matchesCode = relevantAlertCodes(params.classification);
  const alerts = params.state.alerts
    .filter((alert) => matchesCode(alert.code))
    .slice(0, 4);
  if (alerts.length > 0) {
    lines.push("Needs attention:");
    for (const alert of alerts) {
      lines.push(`• ${alert.title} — ${alert.message}`);
    }
  }

  const suggestions = params.state.suggestions
    .filter(
      (suggestion) =>
        params.classification.domain === "reporting" ||
        suggestion.domain === params.classification.domain,
    )
    .slice(0, 2);
  if (suggestions.length > 0) {
    lines.push("Recommended next moves:");
    for (const suggestion of suggestions) {
      lines.push(`• ${suggestion.title} — ${suggestion.description}`);
    }
  }

  return lines.join("\n");
}
