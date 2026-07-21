import type { AssistantAskContext } from "@/features/agent/assistant/types";

export type ShopAssistantActionIntent = {
  kind: "action";
  domain: "work_orders";
  toolName: "set_work_order_hold";
  label: string;
  summary: string;
  riskLevel: "medium";
  input: {
    workOrderReference: string;
    reason: string;
  };
};

export type ShopAssistantIntent =
  | ShopAssistantActionIntent
  | { kind: "query" }
  | {
      kind: "clarification";
      domain: string;
      summary: string;
      plannerGoal?: string;
    };

const INFORMATIONAL_PREFIX =
  /^(what|which|who|when|where|why|how|show|list|find|tell|is|are|do|does|did|can i see|give me)\b/i;
const ACTION_PREFIX =
  /^(please\s+)?(can you\s+|could you\s+|will you\s+|would you\s+)?(put|place|mark|set|hold|pause|create|add|send|email|message|text|reschedule|schedule|book|move|assign|approve|reject|decline|order|receive|invoice|complete|close|cancel|update|change|remove|release)\b/i;

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/g, " ").trim();
}

function looksLikeHoldAction(question: string): boolean {
  const q = normalizeQuestion(question);
  if (!q || INFORMATIONAL_PREFIX.test(q)) return false;

  const hasImperative =
    /^(please\s+)?(can you\s+|could you\s+|will you\s+|would you\s+)?(put|place|mark|set|hold|pause)\b/i.test(
      q,
    );
  const hasHoldLanguage = /\b(on\s+hold|hold\s+for|hold\s+until|pause)\b/i.test(q);
  return hasImperative && hasHoldLanguage;
}

function extractWorkOrderReference(question: string): string | null {
  const explicit = question.match(
    /\b(?:work\s*order|wo)\s*#?\s*([a-z0-9][a-z0-9-]{2,})\b/i,
  )?.[1];
  if (explicit) return explicit.toUpperCase();

  const hash = question.match(/#\s*([a-z]{1,6}\d{3,}|[0-9a-f-]{36})\b/i)?.[1];
  if (hash) return hash.toUpperCase();

  const customId = question.match(/\b([a-z]{1,6}\d{3,})\b/i)?.[1];
  return customId ? customId.toUpperCase() : null;
}

function extractHoldReason(question: string): string {
  const q = question.toLowerCase();
  if (/\b(parts?|part order|backorder|backordered)\b/.test(q)) {
    return "Awaiting parts";
  }
  if (/\b(customer|authorization|authorisation|approval)\b/.test(q)) {
    return "Awaiting customer authorization";
  }
  if (/\b(additional info|more info|information)\b/.test(q)) {
    return "Need additional info";
  }
  if (/\bassist|assistance|foreman|lead hand\b/.test(q)) {
    return "Hold for assistance";
  }

  const custom = question.match(/\b(?:on\s+hold|hold)\s+for\s+(.+?)(?:[.!?]|$)/i)?.[1];
  if (custom?.trim()) {
    const normalized = custom.trim();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return "Operational hold";
}

function actionDomain(question: string): string {
  const q = question.toLowerCase();
  if (/\b(appointment|booking|schedule|reschedule)\b/.test(q)) return "scheduling";
  if (/\b(part|inventory|purchase order|po\b|receive)\b/.test(q)) return "inventory";
  if (/\b(message|email|text|notify|call customer)\b/.test(q)) return "messaging";
  if (/\b(customer|vehicle)\b/.test(q)) return "customers";
  if (/\b(inspection|dvi)\b/.test(q)) return "inspections";
  if (/\b(invoice|payment|estimate|quote|approval)\b/.test(q)) return "invoices";
  if (/\b(technician|tech|employee|shift|workforce|assign)\b/.test(q)) return "workforce";
  return "work_orders";
}

export function classifyShopAssistantIntent(
  question: string,
  context?: AssistantAskContext,
): ShopAssistantIntent {
  const normalized = normalizeQuestion(question);

  if (looksLikeHoldAction(normalized)) {
    const reference =
      extractWorkOrderReference(normalized) ?? context?.workOrderId ?? null;

    if (!reference) {
      return {
        kind: "clarification",
        domain: "work_orders",
        summary:
          "I recognized a request to place a work order on hold. Which work order should I use?",
      };
    }

    const reason = extractHoldReason(normalized);
    const displayReference = extractWorkOrderReference(normalized) ?? "the current work order";
    return {
      kind: "action",
      domain: "work_orders",
      toolName: "set_work_order_hold",
      label: `Place ${displayReference} on hold`,
      summary: `Place ${displayReference} on hold with the reason “${reason}”.`,
      riskLevel: "medium",
      input: {
        workOrderReference: reference,
        reason,
      },
    };
  }

  if (ACTION_PREFIX.test(normalized) && !INFORMATIONAL_PREFIX.test(normalized)) {
    const domain = actionDomain(normalized);
    return {
      kind: "clarification",
      domain,
      summary:
        "I recognized this as an action request, so I will not answer it as a status question. This action needs a supported, reviewable tool before it can run.",
      plannerGoal: normalized,
    };
  }

  return { kind: "query" };
}
