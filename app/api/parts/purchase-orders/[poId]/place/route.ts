import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

type Body = {
  contactChannel?: unknown;
  idempotencyKey?: unknown;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: Record<string, unknown> | null;
    error: {
      message?: string | null;
      details?: string | null;
      hint?: string | null;
      code?: string | null;
    } | null;
  }>;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ poId: string }> },
) {
  const { poId } = await context.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const idempotencyKey =
    clean(request.headers.get("Idempotency-Key")) ||
    clean(body?.idempotencyKey);
  const contactChannel = clean(body?.contactChannel).toLowerCase();

  if (
    !isUuid(poId) ||
    !idempotencyKey ||
    idempotencyKey.length > 200 ||
    (contactChannel && contactChannel !== "email" && contactChannel !== "phone")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A valid purchase order, contact method, and stable idempotency key are required.",
      },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const scopedKey = `${access.profile.shop_id}:parts_place_purchase_order:${idempotencyKey}`;
  const { data, error } = await (access.supabase as unknown as RpcClient).rpc(
    "parts_place_purchase_order",
    {
      p_po_id: poId,
      p_idempotency_key: scopedKey,
      p_contact_channel: contactChannel || null,
    },
  );

  if (error) {
    const safeError = toSafeDatabaseError(error, {
      context: "parts/po/place",
      fallback: "The purchase order could not be placed.",
      publicMessagePatterns: [
        /^Purchase order not found/i,
        /^Only a draft purchase order/i,
        /^Add at least one active line/i,
        /^A supplier contact method is required/i,
        /^Purchase order supplier was not found/i,
        /^The selected supplier does not have/i,
      ],
    });
    return NextResponse.json(
      {
        ok: false,
        error: safeError.message,
        correlationId: safeError.correlationId,
      },
      {
        status:
          safeError.isPublicMessage && error.code === "P0002"
            ? 404
            : safeError.isPublicMessage
              ? 409
              : 500,
      },
    );
  }

  return NextResponse.json({ ok: true, result: data });
}
