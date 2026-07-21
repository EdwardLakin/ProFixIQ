import { NextResponse } from "next/server";

import type { AssistantConversationMessage } from "@/features/agent/assistant/types";
import { orchestrateShopAssistantTurn } from "@/features/shop-assistant/server/orchestrator/orchestrateShopAssistantTurn";
import type { ShopAssistantOrchestratorResult } from "@/features/shop-assistant/server/orchestrator/types";
import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  findAssistantReply,
  getOrCreateShopAssistantThread,
  insertAssistantMessage,
  insertUserMessageIdempotent,
  loadShopAssistantMessages,
  threadContextFromPage,
  updateShopAssistantThreadContext,
} from "@/features/shop-assistant/server/threadStore";
import type {
  ShopAssistantActionPreview,
  ShopAssistantActionResult,
  ShopAssistantChatRequest,
  ShopAssistantChatResponse,
  ShopAssistantMessage,
  ShopAssistantThreadContext,
  ShopAssistantTurn,
} from "@/features/shop-assistant/types";

function conversationMessages(
  messages: ShopAssistantMessage[],
): AssistantConversationMessage[] {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content.trim(),
    )
    .slice(-20)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content.trim().slice(0, 4000),
    }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function actionPreviewFromPayload(
  payload: Record<string, unknown>,
): ShopAssistantActionPreview | null {
  const action = asRecord(payload.action);
  if (
    typeof action.id !== "string" ||
    typeof action.toolName !== "string" ||
    typeof action.title !== "string" ||
    typeof action.summary !== "string" ||
    typeof action.expiresAt !== "string"
  ) {
    return null;
  }
  return action as unknown as ShopAssistantActionPreview;
}

function actionResultFromPayload(
  payload: Record<string, unknown>,
): ShopAssistantActionResult | null {
  const action = asRecord(payload.action);
  if (
    typeof action.id !== "string" ||
    typeof action.toolName !== "string" ||
    typeof action.status !== "string" ||
    typeof action.summary !== "string"
  ) {
    return null;
  }
  return action as unknown as ShopAssistantActionResult;
}

function clarificationFieldsFromPayload(
  payload: Record<string, unknown>,
): Extract<ShopAssistantTurn, { kind: "clarification_required" }>["fields"] {
  return Array.isArray(payload.fields)
    ? (payload.fields as Extract<
        ShopAssistantTurn,
        { kind: "clarification_required" }
      >["fields"])
    : [];
}

function turnFromMessage(message: ShopAssistantMessage): ShopAssistantTurn {
  const actionPreview = actionPreviewFromPayload(message.payload);
  if (message.kind === "confirmation" && actionPreview) {
    return { kind: "confirmation_required", message, action: actionPreview };
  }

  const actionResult = actionResultFromPayload(message.payload);
  if (
    (message.kind === "action_result" || message.kind === "error") &&
    actionResult
  ) {
    return { kind: "action_result", message, action: actionResult };
  }

  const fields = clarificationFieldsFromPayload(message.payload);
  if (fields.length > 0) {
    return { kind: "clarification_required", message, fields };
  }

  return { kind: "answer", message };
}

function responseFromExisting(params: {
  thread: Awaited<ReturnType<typeof getOrCreateShopAssistantThread>>;
  messages: ShopAssistantMessage[];
  reply: ShopAssistantMessage;
}): ShopAssistantChatResponse {
  return {
    ok: true,
    thread: params.thread,
    messages: params.messages,
    turn: turnFromMessage(params.reply),
  };
}

function resultMessageKind(
  result: ShopAssistantOrchestratorResult,
): ShopAssistantMessage["kind"] {
  if (result.kind === "confirmation_required") return "confirmation";
  if (result.kind === "action_result") return "action_result";
  return "text";
}

function resultPayload(
  result: ShopAssistantOrchestratorResult,
  requestClientMessageId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { requestClientMessageId };
  if (result.kind === "read_result") {
    payload.toolName = result.toolName;
    payload.output = result.output;
    payload.domain = result.domain;
  } else if (result.kind === "confirmation_required") {
    payload.action = result.action;
  } else if (result.kind === "action_result") {
    payload.action = result.action;
  } else if (result.kind === "clarification_required") {
    payload.fields = result.fields;
  } else {
    Object.assign(payload, result.payload, {
      domain: result.domain,
      intent: result.kind === "answer" ? result.intent : "unsupported_action",
    });
  }
  return payload;
}

function resultContext(
  result: ShopAssistantOrchestratorResult,
): ShopAssistantThreadContext {
  if (result.kind === "clarification_required") return {};
  return result.resolvedContext ?? {};
}

function resultTurn(
  result: ShopAssistantOrchestratorResult,
  message: ShopAssistantMessage,
): ShopAssistantTurn {
  if (result.kind === "confirmation_required") {
    return { kind: "confirmation_required", message, action: result.action };
  }
  if (result.kind === "action_result") {
    return { kind: "action_result", message, action: result.action };
  }
  if (result.kind === "clarification_required") {
    return { kind: "clarification_required", message, fields: result.fields };
  }
  return { kind: "answer", message };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireShopAssistantActor>> | null = null;
  let threadId: string | null = null;
  let requestClientMessageId: string | null = null;

  try {
    actor = await requireShopAssistantActor();
    const body = (await request.json().catch(() => null)) as
      | ShopAssistantChatRequest
      | null;
    const question = body?.question?.trim() ?? "";
    const clientMessageId = body?.clientMessageId?.trim() ?? "";

    if (!question) {
      return NextResponse.json<ShopAssistantChatResponse>(
        { ok: false, error: "Question is required", retryable: false },
        { status: 400 },
      );
    }
    if (question.length > 8000) {
      return NextResponse.json<ShopAssistantChatResponse>(
        { ok: false, error: "Question is too long", retryable: false },
        { status: 400 },
      );
    }
    if (clientMessageId.length < 8 || clientMessageId.length > 200) {
      return NextResponse.json<ShopAssistantChatResponse>(
        {
          ok: false,
          error: "A valid client message id is required",
          retryable: false,
        },
        { status: 400 },
      );
    }

    requestClientMessageId = clientMessageId;
    let thread = await getOrCreateShopAssistantThread(
      actor,
      body?.threadId,
      body?.context,
    );
    threadId = thread.id;

    const requestedContext = threadContextFromPage(body?.context);
    if (Object.values(requestedContext).some(Boolean)) {
      thread = await updateShopAssistantThreadContext({
        actor,
        thread,
        context: requestedContext,
      });
    }

    const userWrite = await insertUserMessageIdempotent({
      actor,
      threadId: thread.id,
      content: question,
      clientMessageId,
      payload: {
        pageType: body?.context?.pageType,
        pageTitle: body?.context?.pageTitle,
      },
    });

    if (!userWrite.created) {
      const existingReply = await findAssistantReply(
        actor,
        thread.id,
        clientMessageId,
      );
      if (!existingReply) {
        return NextResponse.json<ShopAssistantChatResponse>(
          {
            ok: false,
            error: "This request is already being processed",
            retryable: true,
          },
          { status: 409 },
        );
      }

      const messages = await loadShopAssistantMessages(actor, thread.id);
      return NextResponse.json(
        responseFromExisting({ thread, messages, reply: existingReply }),
      );
    }

    const storedMessages = await loadShopAssistantMessages(actor, thread.id);
    const result = await orchestrateShopAssistantTurn({
      actor,
      threadId: thread.id,
      clientMessageId,
      question,
      pageContext: body?.context,
      threadContext: thread.context,
      messages: conversationMessages(storedMessages),
    });

    const reply = await insertAssistantMessage({
      actor,
      threadId: thread.id,
      kind: resultMessageKind(result),
      content: result.content,
      payload: resultPayload(result, clientMessageId),
    });

    const shouldSetTitle = thread.title === "Shop Assistant";
    thread = await updateShopAssistantThreadContext({
      actor,
      thread,
      context: resultContext(result),
      title: shouldSetTitle ? question.slice(0, 80) : undefined,
    });
    const messages = await loadShopAssistantMessages(actor, thread.id);

    return NextResponse.json<ShopAssistantChatResponse>({
      ok: true,
      thread,
      messages,
      turn: resultTurn(result, reply),
    });
  } catch (error: unknown) {
    if (actor && threadId && requestClientMessageId) {
      try {
        await insertAssistantMessage({
          actor,
          threadId,
          kind: "error",
          content: shopAssistantErrorMessage(error),
          payload: {
            requestClientMessageId,
            retryable: true,
          },
        });
      } catch {
        // Preserve the original failure when persistence also fails.
      }
    }

    return NextResponse.json<ShopAssistantChatResponse>(
      {
        ok: false,
        error: shopAssistantErrorMessage(error),
        retryable: shopAssistantErrorStatus(error) >= 500,
      },
      { status: shopAssistantErrorStatus(error) },
    );
  }
}
