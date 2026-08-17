import { NextResponse } from "next/server";

import type {
  ShopAssistantContext,
  ShopAssistantMessagesResponse,
  ShopAssistantThreadListResponse,
} from "@/features/shop-assistant/types";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  createShopAssistantThread,
  listShopAssistantThreads,
} from "@/features/shop-assistant/server/threadStore";
import { resolveTrustedShopAssistantContext } from "@/features/shop-assistant/server/trustedContext";

export async function GET() {
  try {
    const actor = await requireShopAssistantActor();
    const threads = await listShopAssistantThreads(actor);

    return NextResponse.json<ShopAssistantThreadListResponse>({
      ok: true,
      threads,
      activeThreadId: threads[0]?.id ?? null,
      role: actor.canonicalRole,
    });
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "shop-assistant-threads-list",
    );
    return NextResponse.json<ShopAssistantThreadListResponse>(
      { ok: false, error: resolved.message },
      { status: resolved.status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireShopAssistantActor();
    const body = (await request.json().catch(() => ({}))) as {
      context?: ShopAssistantContext;
    };
    const trusted = await resolveTrustedShopAssistantContext({
      actor,
      requested: body.context,
      stored: {},
    });
    const thread = await createShopAssistantThread(actor, trusted.pageContext);

    return NextResponse.json<ShopAssistantMessagesResponse>(
      {
        ok: true,
        thread,
        messages: [],
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "shop-assistant-thread-create",
    );
    return NextResponse.json<ShopAssistantMessagesResponse>(
      { ok: false, error: resolved.message },
      { status: resolved.status },
    );
  }
}
