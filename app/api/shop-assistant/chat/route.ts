import { NextResponse } from "next/server";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAnswer,
  AssistantConversationMessage,
  AssistantResolvedContext,
} from "@/features/agent/assistant/types";
import { routeDirectToolIntent } from "@/features/shop-assistant/server/actions/directToolIntent";
import { orchestrateShopAssistantTurn } from "@/features/shop-assistant/server/orchestrator/orchestrateShopAssistantTurn";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  findAssistantReply,
  getOrCreateShopAssistantThread,
  insertAssistantMessage,
  insertUserMessageIdempotent,
  loadShopAssistantMessages,
  mergeThreadContext,
  threadContextFromPage,
  updateShopAssistantThreadContext,
} from "@/features/shop-assistant/server/threadStore";
import { resolveTrustedShopAssistantContext } from "@/features/shop-assistant/server/trustedContext";
import type {
  ShopAssistantActionPreview,
  ShopAssistantActionResult,
  ShopAssistantChatRequest,
  ShopAssistantChatResponse,
  ShopAssistantMessage,
  ShopAssistantThreadContext,
  ShopAssistantTurn,
} from "@/features/shop-assistant/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
  const freshness = answer.grounding
    ? `Data current as of ${answer.grounding.dataCurrentAsOf} • ${answer.grounding.recordCount} record(s).`
    : "";
  return uniqueLines([answer.summary, ...answer.bullets, freshness]).join("\n");
}

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

function isRetryableRequestError(message: ShopAssistantMessage): boolean {
  return message.kind === "error" && message.payload.retryable === true;
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireShopAssistantActor>> | null =
    null;
  let threadId: string | null = null;
  let requestClientMessageId: string | null = null;

  try {
    actor = await requireShopAssistantActor();
    const body = (await request
      .json()
      .catch(() => null)) as ShopAssistantChatRequest | null;
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
    if (
      clientMessageId.length < 8 ||
      clientMessageId.length > 200 ||
      clientMessageId.startsWith("shop-reply:") ||
      clientMessageId.startsWith("shop-action:")
    ) {
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
      undefined,
    );
    threadId = thread.id;

    const trusted = await resolveTrustedShopAssistantContext({
      actor,
      requested: body?.context,
      stored: thread.context,
    });
    const requestedContext = threadContextFromPage(trusted.pageContext);
    if (
      Object.values(requestedContext).some(Boolean) ||
      JSON.stringify(thread.context) !== JSON.stringify(trusted.threadContext)
    ) {
      thread = await updateShopAssistantThreadContext({
        actor,
        thread,
        context: trusted.threadContext,
        replaceContext: true,
      });
    }

    const userWrite = await insertUserMessageIdempotent({
      actor,
      threadId: thread.id,
      content: question,
      clientMessageId,
      payload: {
        pageType: trusted.pageContext.pageType,
        pageTitle: trusted.pageContext.pageTitle,
      },
    });

    if (!userWrite.created) {
      const existingReply = await findAssistantReply(
        actor,
        thread.id,
        clientMessageId,
      );
      if (existingReply && !isRetryableRequestError(existingReply)) {
        const messages = await loadShopAssistantMessages(actor, thread.id);
        return NextResponse.json(
          responseFromExisting({ thread, messages, reply: existingReply }),
        );
      }
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
      // A persisted transient error is not a successful idempotent reply.
      // Continue with the same request id so reads run again and any staged
      // write reuses its original action/idempotency key.
    }

    const storedMessages = await loadShopAssistantMessages(actor, thread.id);
    const direct = await routeDirectToolIntent({
      actor,
      threadId: thread.id,
      clientMessageId,
      question,
      pageContext: trusted.pageContext,
      threadContext: trusted.threadContext,
      mode: "writes_only",
    });

    if (direct) {
      const kind =
        direct.kind === "confirmation_required"
          ? "confirmation"
          : direct.kind === "action_result"
            ? "action_result"
            : "text";
      const payload: Record<string, unknown> = {
        requestClientMessageId: clientMessageId,
      };
      if (direct.kind === "read_result") {
        payload.toolName = direct.toolName;
        payload.output = direct.output;
      } else if (direct.kind === "confirmation_required") {
        payload.action = direct.action;
      } else if (direct.kind === "action_result") {
        payload.action = direct.action;
      } else {
        payload.fields = direct.fields;
      }

      const reply = await insertAssistantMessage({
        actor,
        threadId: thread.id,
        kind,
        content: direct.content,
        payload,
      });

      const shouldSetTitle = thread.title === "Shop Assistant";
      thread = await updateShopAssistantThreadContext({
        actor,
        thread,
        context:
          direct.kind === "clarification_required"
            ? {}
            : (direct.resolvedContext ?? {}),
        title: shouldSetTitle ? question.slice(0, 80) : undefined,
      });
      const messages = await loadShopAssistantMessages(actor, thread.id);

      const turn: ShopAssistantTurn =
        direct.kind === "confirmation_required"
          ? {
              kind: "confirmation_required",
              message: reply,
              action: direct.action,
            }
          : direct.kind === "action_result"
            ? { kind: "action_result", message: reply, action: direct.action }
            : direct.kind === "clarification_required"
              ? {
                  kind: "clarification_required",
                  message: reply,
                  fields: direct.fields,
                }
              : { kind: "answer", message: reply };

      return NextResponse.json<ShopAssistantChatResponse>({
        ok: true,
        thread,
        messages,
        turn,
      });
    }

    const orchestrated = await orchestrateShopAssistantTurn({
      actor,
      threadId: thread.id,
      clientMessageId,
      question,
      pageContext: trusted.pageContext,
      threadContext: trusted.threadContext,
      messages: storedMessages,
    });

    if (orchestrated.kind !== "informational") {
      const kind =
        orchestrated.kind === "confirmation_required"
          ? "confirmation"
          : orchestrated.kind === "action_result"
            ? "action_result"
            : "text";
      const payload: Record<string, unknown> = {
        requestClientMessageId: clientMessageId,
        planner: orchestrated.planner,
      };
      if (orchestrated.kind === "read_result") {
        payload.toolCalls = orchestrated.outputs;
      } else if (orchestrated.kind === "confirmation_required") {
        payload.action = orchestrated.action;
      } else if (orchestrated.kind === "action_result") {
        payload.action = orchestrated.action;
      } else if (orchestrated.kind === "clarification_required") {
        payload.fields = orchestrated.fields;
      } else {
        payload.links = [
          {
            label: "Open Technician CoPilot",
            href: orchestrated.href,
          },
        ];
      }

      const reply = await insertAssistantMessage({
        actor,
        threadId: thread.id,
        kind,
        content: orchestrated.content,
        payload,
      });
      const shouldSetTitle = thread.title === "Shop Assistant";
      thread = await updateShopAssistantThreadContext({
        actor,
        thread,
        context:
          "resolvedContext" in orchestrated
            ? (orchestrated.resolvedContext ?? {})
            : {},
        title: shouldSetTitle ? question.slice(0, 80) : undefined,
      });
      const messages = await loadShopAssistantMessages(actor, thread.id);

      const turn: ShopAssistantTurn =
        orchestrated.kind === "confirmation_required"
          ? {
              kind: "confirmation_required",
              message: reply,
              action: orchestrated.action,
            }
          : orchestrated.kind === "action_result"
            ? {
                kind: "action_result",
                message: reply,
                action: orchestrated.action,
              }
            : orchestrated.kind === "clarification_required"
              ? {
                  kind: "clarification_required",
                  message: reply,
                  fields: orchestrated.fields,
                }
              : { kind: "answer", message: reply };

      return NextResponse.json<ShopAssistantChatResponse>({
        ok: true,
        thread,
        messages,
        turn,
      });
    }

    const answer = await answerAssistant({
      shopId: actor.shopId,
      userId: actor.userId,
      profileId: actor.profileId,
      role: actor.role,
      request: {
        question,
        context: trusted.pageContext,
        session: {
          workOrderId: trusted.threadContext.activeWorkOrderId,
          vehicleId: trusted.threadContext.activeVehicleId,
          customerId: trusted.threadContext.activeCustomerId,
          bookingId: trusted.threadContext.activeBookingId,
        },
        messages: conversationMessages(storedMessages),
      },
    });

    const reply = await insertAssistantMessage({
      actor,
      threadId: thread.id,
      content: answerContent(answer),
      payload: {
        requestClientMessageId: clientMessageId,
        answer,
        planner: orchestrated.planner,
      },
    });

    const nextContext = mergeThreadContext(
      contextFromResolved(answer.resolvedContext),
      { lastIntent: answer.intent },
    );
    const shouldSetTitle = thread.title === "Shop Assistant";
    thread = await updateShopAssistantThreadContext({
      actor,
      thread,
      context: nextContext,
      title: shouldSetTitle ? question.slice(0, 80) : undefined,
    });

    const messages = await loadShopAssistantMessages(actor, thread.id);
    return NextResponse.json<ShopAssistantChatResponse>({
      ok: true,
      thread,
      messages,
      turn: {
        kind: "answer",
        message: reply,
      },
    });
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(error, "shop-assistant-chat");
    if (actor && threadId && requestClientMessageId) {
      try {
        await insertAssistantMessage({
          actor,
          threadId,
          kind: "error",
          content: resolved.message,
          payload: {
            requestClientMessageId,
            retryable: resolved.retryable,
          },
        });
      } catch {
        // Preserve the original failure when persistence also fails.
      }
    }

    return NextResponse.json<ShopAssistantChatResponse>(
      {
        ok: false,
        error: resolved.message,
        retryable: resolved.retryable,
      },
      { status: resolved.status },
    );
  }
}
