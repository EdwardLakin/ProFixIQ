import { NextResponse } from "next/server";
import {
  getMobileFieldServiceAccess,
  listFieldOperatorAssignedWorkOrderIds,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import {
  resolveShopProductAccess,
  SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  loadPartsRequestQueue,
  PARTS_REQUEST_QUEUE_ROLES,
} from "@/features/parts/server/loadPartsRequestQueue";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

type PartsQueueScope =
  | { ok: true; workOrderIds?: string[] }
  | { ok: false; response: NextResponse };

async function resolvePartsQueueScope(
  access: ShopAccess,
): Promise<PartsQueueScope> {
  const shopAccess = await resolveShopProductAccess({
    supabase: access.supabase,
    shopId: access.profile.shop_id,
    capabilities: SHOP_PRODUCT_CAPABILITIES,
  });
  if (shopAccess.error) throw new Error(shopAccess.error);
  if (shopAccess.entitled) return { ok: true };

  const fieldAccess = await getMobileFieldServiceAccess(access);
  if (!fieldAccess.canAccessFieldService) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Field Service access is required." },
        { status: 403, headers: RESPONSE_HEADERS },
      ),
    };
  }

  return {
    ok: true,
    workOrderIds: await listFieldOperatorAssignedWorkOrderIds(access),
  };
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: PARTS_REQUEST_QUEUE_ROLES,
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const realtimeRequestId = new URL(request.url).searchParams.get("requestId");
  if (realtimeRequestId && !isUuid(realtimeRequestId)) {
    return NextResponse.json(
      { ok: false, error: "A valid requestId is required." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const correlationId = requestId();
  try {
    const scope = await resolvePartsQueueScope(access);
    if (!scope.ok) return scope.response;

    const snapshot = await loadPartsRequestQueue({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      requestId: realtimeRequestId,
      workOrderIds: scope.workOrderIds,
      signal: request.signal,
    });
    return NextResponse.json(
      { ok: true, snapshot },
      {
        headers: {
          ...RESPONSE_HEADERS,
          "x-request-id": correlationId,
        },
      },
    );
  } catch (error) {
    console.error("[parts-request-queue] aggregate load failed", {
      correlationId,
      shopId: access.profile.shop_id,
      cause:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "The Parts request queue could not be loaded.",
      },
      {
        status: 500,
        headers: {
          ...RESPONSE_HEADERS,
          "x-request-id": correlationId,
        },
      },
    );
  }
}
