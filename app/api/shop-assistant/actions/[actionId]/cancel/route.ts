import { NextResponse } from "next/server";

import {
  cancelAction,
  mapActionResult,
} from "@/features/shop-assistant/server/actions/actionStore";
import { findOrCreateActionMessage } from "@/features/shop-assistant/server/actions/actionMessages";
import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  getShopAssistantThread,
  loadShopAssistantMessages,
} from "@/features/shop-assistant/server/threadStore";
import type { ShopAssistantChatResponse } from "@/features/shop-assistant/types";

type RouteContext = {
  params: Promise<{ actionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const actor = await requireShopAssistantActor();
    const { actionId } = await context.params;
    const row = await cancelAction({ actor, actionId });
    const action = mapActionResult(row);
    const message = await findOrCreateActionMessage({
      actor,
      threadId: row.thread_id,
      actionId: row.id,
      kind: "action_result",
      content: action.summary,
      payload: { action },
    });
    const thread = await getShopAssistantThread(actor, row.thread_id);
    const messages = await loadShopAssistantMessages(actor, row.thread_id);

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
