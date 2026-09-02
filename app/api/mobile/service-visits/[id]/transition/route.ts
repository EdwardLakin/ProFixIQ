import { NextResponse } from "next/server";

import type { ServiceVisitStatus } from "@/features/scheduling/lib/service-visit-contract";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";
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
  // Current product access is revocable, but an actor-owned committed receipt
  // must remain replayable. Fresh transitions pass the Field gate below.
  const authenticatedAccess = await requireShopScopedApiAccess({
    requiredProductCapabilities: [],
  });
  if (!authenticatedAccess.ok) return authenticatedAccess.response;
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

  const receiptLookupRpc = authenticatedAccess.supabase.rpc.bind(
    authenticatedAccess.supabase,
  ) as unknown as UntypedRpc;
  const { data: hasCommittedReceipt, error: receiptLookupError } =
    await receiptLookupRpc(
      "mobile_service_visit_transition_receipt_exists",
      {
        p_shop_id: authenticatedAccess.profile.shop_id,
        p_actor_user_id: authenticatedAccess.authUserId,
        p_operation_key: operationKey,
      },
    );

  if (receiptLookupError) {
    return NextResponse.json(
      { error: receiptLookupError.message },
      { status: receiptLookupError.code === "42501" ? 403 : 400 },
    );
  }

  let transitionAccess = authenticatedAccess;
  if (hasCommittedReceipt !== true) {
    const fieldAccess = await requireMobileServiceOperatorApiAccess();
    if (!fieldAccess.ok) return fieldAccess.response;
    transitionAccess = fieldAccess;
  }

  const rpc = transitionAccess.supabase.rpc.bind(
    transitionAccess.supabase,
  ) as unknown as UntypedRpc;
  const { data, error } = await rpc(
    "mobile_replay_service_visit_transition_atomic",
    {
      p_shop_id: transitionAccess.profile.shop_id,
      p_visit_id: id,
      p_from_status: fromStatus,
      p_to_status: toStatus,
      p_expected_version: expectedVersion,
      p_actor_user_id: transitionAccess.authUserId,
      p_operation_key: operationKey,
    },
  );

  if (error) {
    const stale =
      error.code === "40001" || /STATE_CHANGED|VERSION_CHANGED/i.test(error.message);
    const workOrderRequired = /linked work order is required/i.test(error.message);
    return NextResponse.json(
      {
        error: stale
          ? "This service call changed on another device. Refresh before continuing."
          : workOrderRequired
            ? "Create the work order before starting or completing repair."
            : error.message,
      },
      {
        status:
          error.code === "42501"
            ? 403
            : stale || workOrderRequired
              ? 409
              : 400,
      },
    );
  }
  return NextResponse.json(data);
}
