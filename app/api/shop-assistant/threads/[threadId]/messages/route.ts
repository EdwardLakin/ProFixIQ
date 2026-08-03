import { NextResponse } from "next/server";

import type { ShopAssistantMessagesResponse } from "@/features/shop-assistant/types";
import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  getShopAssistantThread,
  loadShopAssistantMessages,
} from "@/features/shop-assistant/server/threadStore";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireShopAssistantActor();
    const { threadId } = await context.params;
    const thread = await getShopAssistantThread(actor, threadId);
    const messages = await loadShopAssistantMessages(actor, thread.id);

    return NextResponse.json<ShopAssistantMessagesResponse>({
      ok: true,
      thread,
      messages,
    });
  } catch (error: unknown) {
    return NextResponse.json<ShopAssistantMessagesResponse>(
      { ok: false, error: shopAssistantErrorMessage(error) },
      { status: shopAssistantErrorStatus(error) },
    );
  }
}
