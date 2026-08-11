import { NextResponse } from "next/server";

import type { ServiceVisitStatus } from "@/features/scheduling/lib/service-visit-contract";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const STATUSES = new Set<ServiceVisitStatus>([
  "scheduled",
  "dispatched",
  "en_route",
  "arrived",
  "working",
  "paused",
  "completed",
  "cancelled",
]);

type Body = {
  fromStatus?: ServiceVisitStatus;
  toStatus?: ServiceVisitStatus;
  expectedVersion?: number;
  operationKey?: string;
};

type RpcResult = {
  data: unknown;
  error: { code?: string | null; message: string } | null;
};

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<RpcResult>;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const fromStatus = body?.fromStatus;
  const toStatus = body?.toStatus;
  const expectedVersion = Number(body?.expectedVersion);
  const operationKey =
    body?.operationKey?.trim() ||
    request.headers.get("idempotency-key")?.trim() ||
    "";

  if (
    !id ||
    !fromStatus ||
    !toStatus ||
    !STATUSES.has(fromStatus) ||
    !STATUSES.has(toStatus) ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0 ||
    !operationKey
  ) {
    return NextResponse.json(
      {
        error:
          "Visit, from/to status, expected version, and operation key are required.",
      },
      { status: 400 },
    );
  }

  const rpc = access.supabase.rpc.bind(access.supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc(
    "mobile_replay_service_visit_transition_atomic",
    {
      p_shop_id: access.profile.shop_id,
      p_visit_id: id,
      p_from_status: fromStatus,
      p_to_status: toStatus,
      p_expected_version: expectedVersion,
      p_actor_user_id: access.authUserId,
      p_operation_key: operationKey,
    },
  );

  if (error) {
    const stale =
      error.code === "40001" || /STATE_CHANGED|VERSION_CHANGED/i.test(error.message);
    return NextResponse.json(
      {
        error: stale
          ? "This service call changed on another device. Refresh before continuing."
          : error.message,
      },
      { status: error.code === "42501" ? 403 : stale ? 409 : 400 },
    );
  }
  return NextResponse.json(data);
}
