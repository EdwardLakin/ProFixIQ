import "server-only";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAnswer,
  AssistantResolvedContext,
} from "@/features/agent/assistant/types";
import { routeDirectToolIntent } from "@/features/shop-assistant/server/actions/directToolIntent";
import { getOrRefreshShopState } from "@/features/shop-assistant/server/state/shopStateCache";
import type { ShopAssistantThreadContext } from "@/features/shop-assistant/types";
import { getShopAssistantAgent } from "./agentRegistry";
import { resolveOrchestratorEntities } from "./entityResolver";
import { classifyShopAssistantIntent } from "./intentClassifier";
import { buildStateGroundedAnswer } from "./stateGroundedAnswer";
import type {
  ShopAssistantOrchestratorInput,
  ShopAssistantOrchestratorResult,
} from "./types";

function uniqueLines(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function answerContent(answer: AssistantAnswer): string {
  return uniqueLines([answer.summary, ...answer.bullets]).join("\n");
}

function contextFromResolved(
  resolved?: AssistantResolvedContext,
): ShopAssistantThreadContext {
  return {
    activeWorkOrderId: resolved?.workOrderId,
    activeCustomerId: resolved?.customerId,
    activeVehicleId: resolved?.vehicleId,
    activeBookingId: resolved?.bookingId,
  };
}

function agentPayload(params: {
  agentId: string;
  domain: string;
  confidence: number;
  reason: string;
  stateGeneratedAt: string;
}) {
  return {
    agent: {
      id: params.agentId,
      domain: params.domain,
      confidence: params.confidence,
      reason: params.reason,
    },
    stateGeneratedAt: params.stateGeneratedAt,
  };
}

export async function orchestrateShopAssistantTurn(
  input: ShopAssistantOrchestratorInput,
): Promise<ShopAssistantOrchestratorResult> {
  const entities = resolveOrchestratorEntities({
    pageContext: input.pageContext,
    threadContext: input.threadContext,
  });
  const [state, classification] = await Promise.all([
    getOrRefreshShopState({ actor: input.actor }),
    Promise.resolve(
      classifyShopAssistantIntent({
        question: input.question,
        pageContext: entities.context,
        threadContext: entities.threadContext,
      }),
    ),
  ]);
  const agent = getShopAssistantAgent(classification.agentId);

  const shouldTryDirectTools =
    classification.actionLike || classification.agentId !== "reporting_agent";
  if (shouldTryDirectTools) {
    const direct = await routeDirectToolIntent({
      actor: input.actor,
      threadId: input.threadId,
      clientMessageId: input.clientMessageId,
      question: input.question,
      pageContext: entities.context,
      threadContext: entities.threadContext,
    });
    if (direct) return direct;
  }

  if (agent.id === "diagnostic_boundary_agent") {
    return {
      kind: "answer",
      content:
        agent.boundaryMessage ??
        "Open the work order and use its Technician AI for diagnostic guidance.",
      payload: agentPayload({
        agentId: agent.id,
        domain: agent.domain,
        confidence: classification.confidence,
        reason: classification.reason,
        stateGeneratedAt: state.generatedAt,
      }),
      domain: agent.domain,
      intent: "technician_ai_boundary",
      resolvedContext: entities.threadContext,
    };
  }

  if (classification.actionLike) {
    return {
      kind: "unsupported_action",
      content: `I recognized this as a ${agent.name} action request, but no registered tool can execute it safely yet. No shop record was changed. Rephrase it as a supported action or open the linked workflow for manual review.`,
      payload: {
        ...agentPayload({
          agentId: agent.id,
          domain: agent.domain,
          confidence: classification.confidence,
          reason: classification.reason,
          stateGeneratedAt: state.generatedAt,
        }),
        allowedTools: agent.allowedTools,
      },
      domain: agent.domain,
      resolvedContext: entities.threadContext,
    };
  }

  const stateAnswer = buildStateGroundedAnswer({
    question: input.question,
    state,
    classification,
  });
  if (stateAnswer) {
    return {
      kind: "answer",
      content: stateAnswer,
      payload: {
        ...agentPayload({
          agentId: agent.id,
          domain: agent.domain,
          confidence: classification.confidence,
          reason: classification.reason,
          stateGeneratedAt: state.generatedAt,
        }),
        source: "live_shop_state",
        metrics: state.metrics,
        alertIds: state.alerts.slice(0, 8).map((alert) => alert.id),
      },
      domain: agent.domain,
      intent: "live_shop_state",
      resolvedContext: {
        ...entities.threadContext,
        lastDomain: agent.domain === "diagnostics" ? undefined : agent.domain,
      },
    };
  }

  const answer = await answerAssistant({
    shopId: input.actor.shopId,
    userId: input.actor.userId,
    role: input.actor.role,
    request: {
      question: input.question,
      context: entities.context,
      session: {
        workOrderId: entities.threadContext.activeWorkOrderId,
        vehicleId: entities.threadContext.activeVehicleId,
        customerId: entities.threadContext.activeCustomerId,
        bookingId: entities.threadContext.activeBookingId,
        lastIntent: undefined,
      },
      messages: input.messages,
    },
  });

  return {
    kind: "answer",
    content: answerContent(answer),
    payload: {
      ...agentPayload({
        agentId: agent.id,
        domain: agent.domain,
        confidence: classification.confidence,
        reason: classification.reason,
        stateGeneratedAt: state.generatedAt,
      }),
      source: "specialized_agent_fallback",
      answer,
      activeContext: entities.contextSummary,
      allowedTools: agent.allowedTools,
    },
    domain: agent.domain,
    intent: answer.intent,
    resolvedContext: {
      ...entities.threadContext,
      ...contextFromResolved(answer.resolvedContext),
      lastDomain: agent.domain === "diagnostics" ? undefined : agent.domain,
      lastIntent: answer.intent,
    },
  };
}
