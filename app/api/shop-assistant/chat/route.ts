import { NextResponse } from "next/server";

import { answerAssistant } from "@/features/agent/assistant/server/answerAssistant";
import type {
  AssistantAnswer,
  AssistantConversationMessage,
  AssistantResolvedContext,
} from "@/features/agent/assistant/types";
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
  mergeThreadContext,
  threadContextFromPage,
  updateShopAssistantThreadContext,
} from "@/features/shop-assistant/server/threadStore";
import type {
  ShopAssistantChatRequest,
  ShopAssistantChatResponse,
  ShopAssistantMessage,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";

function isTechnicianDiagnosticRequest(question: string): boolean {
  return /\b(?:[PBCU][0-9A-F]{4}|diagnos(?:e|is|tic)|pinout|expected voltage|misfire|no[- ]start|wiring test)\b/i.test(
    question,
  );
}

function technicianRedirectAnswer(): AssistantAnswer {
  return {
    intent: "unknown",
    summary:
      "Open the work order and use its Technician AI for diagnostic guidance. The shop-wide assistant is reserved for operations, customers, scheduling, parts, billing, reporting, and workforce coordination.",
    bullets: [],
    links: [],
    entities: [],
    actions: [],
  };
}

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

function responseFromExisting(params: {
  thread: Awaited<ReturnType<typeof getOrCreateShopAssistantThread>>;
  messages: ShopAssistantMessage[];
  reply: ShopAssistantMessage;
}): ShopAssistantChatResponse {
  return {
    ok: true,
    thread: params.thread,
    messages: params.messages,
    turn: {
      kind: "answer",
      message: params.reply,
    },
  };
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
    const answer = isTechnicianDiagnosticRequest(question)
      ? technicianRedirectAnswer()
      : await answerAssistant({
          shopId: actor.shopId,
          userId: actor.userId,
          role: actor.role,
          request: {
            question,
            context: body?.context,
            session: {
              workOrderId: thread.context.activeWorkOrderId,
              vehicleId: thread.context.activeVehicleId,
              customerId: thread.context.activeCustomerId,
              bookingId: thread.context.activeBookingId,
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
