import { NextResponse } from "next/server";

import type {
  ShopAssistantContext,
  ShopAssistantThreadListResponse,
} from "@/features/shop-assistant/types";
import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  createShopAssistantThread,
  listShopAssistantThreads,
} from "@/features/shop-assistant/server/threadStore";

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
    return NextResponse.json<ShopAssistantThreadListResponse>(
      { ok: false, error: shopAssistantErrorMessage(error) },
      { status: shopAssistantErrorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireShopAssistantActor();
    const body = (await request.json().catch(() => ({}))) as {
      context?: ShopAssistantContext;
    };
    const thread = await createShopAssistantThread(actor, body.context);

    return NextResponse.json(
      {
        ok: true as const,
        thread,
        messages: [],
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false as const, error: shopAssistantErrorMessage(error) },
      { status: shopAssistantErrorStatus(error) },
    );
  }
}
