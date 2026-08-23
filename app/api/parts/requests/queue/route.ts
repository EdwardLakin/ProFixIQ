import { NextResponse } from "next/server";
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

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: PARTS_REQUEST_QUEUE_ROLES,
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
    const snapshot = await loadPartsRequestQueue({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      requestId: realtimeRequestId,
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
