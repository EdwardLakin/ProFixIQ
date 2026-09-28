import { NextResponse } from "next/server";

import type { ShopAssistantPendingActionsResponse } from "@/features/shop-assistant/types";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";
import { listPendingActionsForActor } from "@/features/shop-assistant/server/actions/actionStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireShopAssistantActor();
    // The popup client establishes a server-relative timestamp before polling.
    // Keep authorization identical for baseline and action requests.
    if (new URL(request.url).searchParams.get("baseline") === "1") {
      const { data: dbNow, error: clockError } = await actor.supabase.rpc(
        "shop_assistant_notification_clock",
      );
      if (clockError || typeof dbNow !== "string") {
        throw new Error(clockError?.message ?? "Database clock unavailable");
      }
      return NextResponse.json(
        { ok: true, actions: [], serverNow: dbNow },
        { headers: { "cache-control": "private, no-store, max-age=0" } },
      );
    }
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
