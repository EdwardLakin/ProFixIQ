import { NextResponse } from "next/server";

import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import { buildShopState } from "@/features/shop-assistant/server/state/buildShopState";
import type { ShopAssistantStateResponse } from "@/features/shop-assistant/server/state/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireShopAssistantActor();
    const state = await buildShopState(actor);

    return NextResponse.json<ShopAssistantStateResponse>(
      { ok: true, state },
      {
        headers: {
          "cache-control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error: unknown) {
    return NextResponse.json<ShopAssistantStateResponse>(
      { ok: false, error: shopAssistantErrorMessage(error) },
      { status: shopAssistantErrorStatus(error) },
    );
  }
}
