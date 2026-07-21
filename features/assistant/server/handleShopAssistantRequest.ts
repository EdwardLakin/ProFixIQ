import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAnswer,
  AssistantAskRequest,
} from "@/features/agent/assistant/types";
import { asShopAssistantClient } from "./shopAssistantDatabase";
import { classifyShopAssistantIntent } from "./shopAssistantIntent";
import {
  appendAssistantMessage,
  createAssistantActionRequest,
  ensureAssistantConversation,
  listAssistantMessages,
  stableHash,
  toPendingAssistantAction,
  updateAssistantConversationState,
} from "./shopAssistantPersistence";
import {
  assistantAnswerTranscriptText,
  normalizeShopAssistantAnswer,
} from "@/features/assistant/lib/assistantText";

function resolvedRequestContext(request: AssistantAskRequest) {
  return {
    workOrderId: request.context?.workOrderId ?? request.session?.workOrderId,
    customerId: request.context?.customerId ?? request.session?.customerId,
    vehicleId: request.context?.vehicleId ?? request.session?.vehicleId,
    bookingId: request.context?.bookingId ?? request.session?.bookingId,
    fleetUnitId: request.context?.fleetUnitId ?? request.session?.fleetUnitId,
  };
}

function contextRecord(request: AssistantAskRequest): Record<string, unknown> {
  return {
    ...resolvedRequestContext(request),
    pageType: request.context?.pageType,
    pageTitle: request.context?.pageTitle,
  };
}

function actionRequestAnswer(params: {
  conversationId: string;
  summary: string;
  pendingAction: NonNullable<AssistantAnswer["pendingAction"]>;
  request: AssistantAskRequest;
}): AssistantAnswer {
  return {
    intent: "action_request",
    summary: params.summary,
    bullets: [
      "Nothing changes until you confirm.",
      "Your role and shop scope will be checked again at execution time.",
    ],
    links: [],
    entities: [],
    actions: [],
    resolvedContext: resolvedRequestContext(params.request),
    conversationId: params.conversationId,
    pendingAction: params.pendingAction,
  };
}

function clarificationAnswer(params: {
  conversationId: string;
  summary: string;
  plannerGoal?: string;
  request: AssistantAskRequest;
}): AssistantAnswer {
  return {
    intent: "action_request",
    summary: params.summary,
    bullets: [],
    links: [],
    entities: [],
    actions: params.plannerGoal
      ? [
          {
            type: "planner",
            label: "Review in Planner",
            goal: params.plannerGoal,
            context: {
              planner: "ops",
              ...resolvedRequestContext(params.request),
            },
          },
        ]
      : [],
    resolvedContext: resolvedRequestContext(params.request),
    conversationId: params.conversationId,
  };
}

export async function handleShopAssistantRequest(params: {
  supabase: SupabaseClient;
  shopId: string;
  userId: string;
  role: string | null;
  request: AssistantAskRequest;
}): Promise<AssistantAnswer> {
  const client = asShopAssistantClient(params.supabase);
  const requestId = params.request.clientRequestId?.trim() || randomUUID();
  const conversation = await ensureAssistantConversation(client, {
    conversationId: params.request.conversationId,
    shopId: params.shopId,
    userId: params.userId,
    context: contextRecord(params.request),
    firstQuestion: params.request.question,
  });

  await appendAssistantMessage(client, {
    conversationId: conversation.id,
    shopId: params.shopId,
    userId: params.userId,
    role: "user",
    content: params.request.question,
    requestId,
    payload: { context: contextRecord(params.request) },
  });

  const history = await listAssistantMessages(client, {
    conversationId: conversation.id,
    shopId: params.shopId,
    userId: params.userId,
    limit: 30,
  });

  const intent = classifyShopAssistantIntent(
    params.request.question,
    params.request.context,
  );

  let answer: AssistantAnswer;

  if (intent.kind === "action") {
    const actionRequest = await createAssistantActionRequest(client, {
      conversationId: conversation.id,
      shopId: params.shopId,
      userId: params.userId,
      toolName: intent.toolName,
      domain: intent.domain,
      label: intent.label,
      summary: intent.summary,
      riskLevel: intent.riskLevel,
      input: intent.input,
      idempotencyKey: stableHash(
        params.shopId,
        params.userId,
        requestId,
        intent.toolName,
        JSON.stringify(intent.input),
      ),
    });

    const pendingAction = toPendingAssistantAction(actionRequest);
    answer = actionRequestAnswer({
      conversationId: conversation.id,
      summary: `I recognized this as an action: ${intent.summary} Review it below before I make the change.`,
      pendingAction,
      request: params.request,
    });
  } else if (intent.kind === "clarification") {
    answer = clarificationAnswer({
      conversationId: conversation.id,
      summary: intent.summary,
      plannerGoal: intent.plannerGoal,
      request: params.request,
    });
  } else {
    const rawAnswer = await answerAssistant({
      shopId: params.shopId,
      userId: params.userId,
      role: params.role,
      request: {
        ...params.request,
        surface: "shop",
        conversationId: conversation.id,
        clientRequestId: requestId,
        messages: history.slice(-20).map(({ role, content }) => ({
          role,
          content,
        })),
      },
    });

    answer = normalizeShopAssistantAnswer({
      ...rawAnswer,
      conversationId: conversation.id,
    });
  }

  await appendAssistantMessage(client, {
    conversationId: conversation.id,
    shopId: params.shopId,
    userId: params.userId,
    role: "assistant",
    content: assistantAnswerTranscriptText(answer),
    requestId,
    payload: {
      intent: answer.intent,
      pendingAction: answer.pendingAction,
      execution: answer.execution,
      resolvedContext: answer.resolvedContext,
    },
  });

  await updateAssistantConversationState(client, {
    conversationId: conversation.id,
    shopId: params.shopId,
    userId: params.userId,
    context: {
      ...contextRecord(params.request),
      ...answer.resolvedContext,
    },
    lastIntent: answer.intent,
  });

  return answer;
}
