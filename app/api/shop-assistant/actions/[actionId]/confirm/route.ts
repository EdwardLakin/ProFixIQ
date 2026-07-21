import { NextResponse } from "next/server";

import {
  acquireActionExecution,
  completeAction,
  failAction,
  mapActionResult,
} from "@/features/shop-assistant/server/actions/actionStore";
import { findOrCreateActionMessage } from "@/features/shop-assistant/server/actions/actionMessages";
import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import { invalidateShopState } from "@/features/shop-assistant/server/state/shopStateCache";
import { executeShopAssistantWriteTool } from "@/features/shop-assistant/server/tools/registry";
import {
  getShopAssistantThread,
  loadShopAssistantMessages,
} from "@/features/shop-assistant/server/threadStore";
import type { ShopAssistantChatResponse } from "@/features/shop-assistant/types";

type RouteContext = {
  params: Promise<{ actionId: string }>;
};

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const actor = await requireShopAssistantActor();
    const { actionId } = await context.params;
    const acquired = await acquireActionExecution({ actor, actionId });

    if (!acquired.acquired && acquired.row.status === "executing") {
      return NextResponse.json<ShopAssistantChatResponse>(
        {
          ok: false,
          error: "This action is already executing.",
          retryable: true,
        },
        { status: 409 },
      );
    }

    let finalRow = acquired.row;
    if (acquired.acquired) {
      try {
        const output = await executeShopAssistantWriteTool({
          name: acquired.row.tool_name,
          input: acquired.row.input,
          context: {
            actor,
            threadId: acquired.row.thread_id,
            actionId: acquired.row.id,
            idempotencyKey: acquired.row.idempotency_key,
            targetVersions: asRecord(acquired.row.target_versions),
          },
        });
        finalRow = await completeAction({
          actor,
          actionId: acquired.row.id,
          result: output,
        });
      } catch (executionError: unknown) {
        finalRow = await failAction({
          actor,
          actionId: acquired.row.id,
          error: executionError,
          retryable: true,
        });
      }
    }

    if (finalRow.status === "succeeded") {
      await invalidateShopState(actor).catch(() => undefined);
    }

    const action = mapActionResult(finalRow);
    const message = await findOrCreateActionMessage({
      actor,
      threadId: finalRow.thread_id,
      actionId: finalRow.id,
      kind: finalRow.status === "failed" ? "error" : "action_result",
      content: action.summary,
      payload: { action },
    });
    const thread = await getShopAssistantThread(actor, finalRow.thread_id);
    const messages = await loadShopAssistantMessages(actor, finalRow.thread_id);

    return NextResponse.json<ShopAssistantChatResponse>({
      ok: true,
      thread,
      messages,
      turn: {
        kind: "action_result",
        message,
        action,
      },
    });
  } catch (error: unknown) {
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
