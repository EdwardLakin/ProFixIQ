import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ESTIMATE_ADVISOR_ROLES } from "@/features/estimates/lib/access";
import { estimateRevisionSchema } from "@/features/estimates/server/schemas";
import {
  estimateMutationError,
  requireIdempotencyKey,
} from "@/features/estimates/server/http";

const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ESTIMATE_ADVISOR_ROLES,
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) return access.response;

  const parsedId = idSchema.safeParse((await context.params).id);
  const parsedBody = estimateRevisionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedId.success || !parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid estimate submission." },
      { status: 400 },
    );
  }
  const idempotency = requireIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const { data, error } = await access.supabase.rpc(
    "submit_estimate_to_parts_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_work_order_id: parsedId.data,
      p_expected_revision: parsedBody.data.expectedRevision,
      p_idempotency_key: idempotency.key,
    },
  );
  if (error) return estimateMutationError(error);
  return NextResponse.json(data);
}
