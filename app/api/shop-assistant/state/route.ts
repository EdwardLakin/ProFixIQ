import { NextResponse } from "next/server";

import {
  requireShopAssistantActor,
  shopAssistantErrorMessage,
  shopAssistantErrorStatus,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import { getOrRefreshShopState } from "@/features/shop-assistant/server/state/shopStateCache";
import type { ShopAssistantStateResponse } from "@/features/shop-assistant/server/state/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireShopAssistantActor();
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const state = await getOrRefreshShopState({ actor, force });

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
