import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  ESTIMATE_ADVISOR_ROLES,
  ESTIMATE_VIEW_ROLES,
} from "@/features/estimates/lib/access";
import { loadEstimateDetail } from "@/features/estimates/server/data";
import { saveEstimateSchema } from "@/features/estimates/server/schemas";
import {
  estimateMutationError,
  requireIdempotencyKey,
} from "@/features/estimates/server/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ESTIMATE_VIEW_ROLES,
  });
  if (!access.ok) return access.response;

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid estimate id." },
      { status: 400 },
    );
  }

  try {
    const payload = await loadEstimateDetail({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
      workOrderId: parsedId.data,
    });
    if (!payload) {
      return NextResponse.json(
        { error: "Estimate not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load estimate.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ESTIMATE_ADVISOR_ROLES,
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) return access.response;

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid estimate id." },
      { status: 400 },
    );
  }
  const idempotency = requireIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const parsed = saveEstimateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid estimate draft.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const lines: Json = parsed.data.lines.map((line) => ({
    clientKey: line.clientKey,
    title: line.title,
    customerDescription: line.customerDescription,
    advisorNotes: line.advisorNotes,
    laborHours: line.laborHours,
    laborRate: line.laborRate,
    parts: line.parts.map((part) => ({
      clientKey: part.clientKey,
      description: part.description,
      quantity: part.quantity,
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
    })),
  }));

  const { data, error } = await access.supabase.rpc(
    "save_estimate_draft_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: parsedId.data,
      p_expected_revision: parsed.data.expectedRevision,
      p_lines: lines,
      p_notes: parsed.data.notes ?? null,
      p_expires_at: parsed.data.expiresAt ?? null,
      p_idempotency_key: idempotency.key,
    },
  );

  if (error) return estimateMutationError(error);
  return NextResponse.json(data);
}
