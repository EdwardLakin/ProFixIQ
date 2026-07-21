import { NextResponse } from "next/server";
import { getShopAssistantStateForActor } from "@/features/assistant/server/shopStateStore";
import type { SuggestedActionContext } from "@/features/assistant/types/suggested-actions";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function optionalParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  if (!value || value.length > 160) return undefined;
  return value;
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const context: SuggestedActionContext = {
    workOrderId: optionalParam(url, "workOrderId"),
    customerId: optionalParam(url, "customerId"),
    vehicleId: optionalParam(url, "vehicleId"),
    bookingId: optionalParam(url, "bookingId"),
    pageType: optionalParam(url, "pageType"),
    pageTitle: optionalParam(url, "pageTitle"),
  };

  try {
    const state = await getShopAssistantStateForActor({
      shopId: access.profile.shop_id,
      userId: access.profile.id,
      role: access.profile.role,
      force: url.searchParams.get("refresh") === "1",
      context,
    });

    return NextResponse.json(
      { ok: true, state },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to build the live shop summary",
      },
      { status: 500 },
    );
  }
}
