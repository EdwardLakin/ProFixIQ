import { NextResponse } from "next/server";

import type { ShopAssistantPendingActionsResponse } from "@/features/shop-assistant/types";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import { listPendingActionsForActor } from "@/features/shop-assistant/server/actions/actionStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireShopAssistantActor();
    const actions = await listPendingActionsForActor(actor);

    return NextResponse.json<ShopAssistantPendingActionsResponse>(
      { ok: true, actions },
      {
        headers: {
          "cache-control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "shop-assistant-actions-pending-list",
    );
    return NextResponse.json<ShopAssistantPendingActionsResponse>(
      { ok: false, error: resolved.message },
      { status: resolved.status },
    );
  }
}
