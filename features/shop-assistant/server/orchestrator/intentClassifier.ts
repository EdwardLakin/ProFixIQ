import "server-only";

import { SHOP_ASSISTANT_AGENTS } from "./agentRegistry";
import type {
  ShopAssistantAgentDefinition,
  ShopAssistantIntentClassification,
} from "./types";
import type {
  ShopAssistantContext,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";

const ACTION_VERBS = [
  "add",
  "assign",
  "book",
  "cancel",
  "clear",
  "close",
  "complete",
  "create",
  "delete",
  "email",
  "hold",
  "invoice",
  "mark",
  "message",
  "move",
  "notify",
  "order",
  "release",
  "remove",
  "reschedule",
  "send",
  "set",
  "update",
];

function normalized(value: string): string {
  return value.toLowerCase().replaceAll("’", "'").trim();
}

function includesKeyword(question: string, keyword: string): boolean {
  return question.includes(keyword.toLowerCase());
}

function contextAgentId(
  pageContext?: ShopAssistantContext,
): ShopAssistantIntentClassification["agentId"] | null {
  const page = normalized(
    [pageContext?.pageType, pageContext?.pageTitle].filter(Boolean).join(" "),
  );
  if (!page) return null;
  if (page.includes("part")) return "inventory_agent";
  if (page.includes("invoice") || page.includes("billing")) return "invoices_agent";
  if (page.includes("booking") || page.includes("appointment")) {
    return "scheduling_agent";
  }
  if (page.includes("customer") || page.includes("client")) return "customers_agent";
  if (page.includes("inspection")) return "inspections_agent";
  if (page.includes("workforce") || page.includes("technician")) {
    return "workforce_agent";
  }
  if (page.includes("work order")) return "work_orders_agent";
  return null;
}

function lastDomainAgentId(
  threadContext: ShopAssistantThreadContext,
): ShopAssistantIntentClassification["agentId"] | null {
  switch (threadContext.lastDomain) {
    case "work_orders":
      return "work_orders_agent";
    case "scheduling":
      return "scheduling_agent";
    case "inventory":
      return "inventory_agent";
    case "customer_communications":
      return "customer_communications_agent";
    case "customers":
      return "customers_agent";
    case "inspections":
      return "inspections_agent";
    case "invoices":
      return "invoices_agent";
    case "workforce":
      return "workforce_agent";
    case "business_analytics":
      return "business_analytics_agent";
    case "reporting":
      return "reporting_agent";
    default:
      return null;
  }
}

export function isActionLikeQuestion(question: string): boolean {
  const q = normalized(question);
  return ACTION_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(q));
}

export function classifyShopAssistantIntent(params: {
  question: string;
  pageContext?: ShopAssistantContext;
  threadContext: ShopAssistantThreadContext;
}): ShopAssistantIntentClassification {
  const question = normalized(params.question);
  const pageAgent = contextAgentId(params.pageContext);
  const lastAgent = lastDomainAgentId(params.threadContext);
  const scores = new Map<ShopAssistantAgentDefinition["id"], number>();
  const reasons = new Map<ShopAssistantAgentDefinition["id"], string[]>();

  for (const agent of SHOP_ASSISTANT_AGENTS) {
    let score = 0;
    const agentReasons: string[] = [];
    for (const keyword of agent.keywords) {
      if (includesKeyword(question, keyword)) {
        score += keyword.includes(" ") ? 4 : 2;
        agentReasons.push(`matched “${keyword}”`);
      }
    }
    if (pageAgent === agent.id) {
      score += 2;
      agentReasons.push("matched current page context");
    }
    if (lastAgent === agent.id && /\b(?:it|that|those|them|there|next|again)\b/i.test(question)) {
      score += 3;
      agentReasons.push("continued the active conversation domain");
    }
    scores.set(agent.id, score);
    reasons.set(agent.id, agentReasons);
  }

  if (/\b[PBCU][0-9A-F]{4}\b/i.test(params.question)) {
    scores.set("diagnostic_boundary_agent", 20);
    reasons.set("diagnostic_boundary_agent", ["matched a diagnostic trouble code"]);
  }

  const ranked = SHOP_ASSISTANT_AGENTS
    .map((agent) => ({ agent, score: scores.get(agent.id) ?? 0 }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0]?.score
    ? ranked[0]
    : {
        agent: SHOP_ASSISTANT_AGENTS.find(
          (agent) => agent.id === (lastAgent ?? pageAgent ?? "reporting_agent"),
        ) ?? SHOP_ASSISTANT_AGENTS.find((agent) => agent.id === "reporting_agent")!,
        score: 1,
      };
  const nextScore = ranked[1]?.score ?? 0;
  const confidence = Math.min(
    0.99,
    Math.max(0.45, 0.55 + selected.score * 0.05 + (selected.score - nextScore) * 0.03),
  );

  return {
    agentId: selected.agent.id,
    domain: selected.agent.domain,
    confidence,
    reason:
      reasons.get(selected.agent.id)?.join(", ") ||
      "selected from active shop context",
    actionLike: isActionLikeQuestion(params.question),
  };
}
