// app/api/fleet/vehicles/[vehicleId]/billing-owner/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { canAcceptFleetServiceRequests } from "@/features/fleet/lib/shopFleetRequestIntake";
import { mapFleetServiceRequestError } from "@/features/fleet/lib/fleetServiceRequestError";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ vehicleId: string }> };

type BillingOwnerRow = {
  already_aligned: boolean;
  applied: boolean;
  vehicle_id: string;
  fleet_id: string;
  fleet_name: string;
  previous_customer_id: string | null;
  previous_customer_name: string | null;
  resolved_customer_id: string;
  resolved_customer_name: string | null;
};

function firstRow(value: unknown): BillingOwnerRow | null {
  if (!Array.isArray(value)) return null;
  const row = value[0];
  if (
    typeof row !== "object" ||
    row === null ||
    typeof (row as { vehicle_id?: unknown }).vehicle_id !== "string"
  ) {
    return null;
  }
  return row as BillingOwnerRow;
}

function toResponseBody(row: BillingOwnerRow) {
  return {
    alreadyAligned: row.already_aligned,
    applied: row.applied,
    vehicleId: row.vehicle_id,
    fleetId: row.fleet_id,
    fleetName: row.fleet_name,
    previousCustomerId: row.previous_customer_id,
    previousCustomerName: row.previous_customer_name,
    resolvedCustomerId: row.resolved_customer_id,
    resolvedCustomerName: row.resolved_customer_name,
  };
}

async function resolveBillingOwner(
  req: NextRequest,
  context: RouteContext,
  apply: boolean,
): Promise<NextResponse> {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  // The database function enforces the same boundary independently, so this
  // is a fast-path rejection, not the real gate.
  if (!(await canAcceptFleetServiceRequests(access))) {
    return NextResponse.json(
      { error: "Fleet request intake access required." },
      { status: 403 },
    );
  }

  const { vehicleId } = await context.params;
  const fleetId = req.nextUrl.searchParams.get("fleetId");
  if (!vehicleId || !fleetId) {
    return NextResponse.json(
      { error: "vehicleId and fleetId are required." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase.rpc(
    "resolve_fleet_vehicle_billing_owner",
    { p_vehicle_id: vehicleId, p_fleet_id: fleetId, p_apply: apply },
  );

  const row = firstRow(data);
  if (error || !row) {
    console.error("[fleet/vehicles/billing-owner] rpc error", error);
    const failure = mapFleetServiceRequestError(
      error,
      "Failed to resolve this unit's billing owner.",
    );
    return NextResponse.json(
      { error: failure.error, reason: failure.reason },
      { status: failure.status },
    );
  }

  return NextResponse.json(toResponseBody(row));
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    return await resolveBillingOwner(req, context, false);
  } catch (err) {
    console.error("[fleet/vehicles/billing-owner] unexpected error", err);
    return NextResponse.json(
      { error: "Failed to look up this unit's billing owner." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    return await resolveBillingOwner(req, context, true);
  } catch (err) {
    console.error("[fleet/vehicles/billing-owner] unexpected error", err);
    return NextResponse.json(
      { error: "Failed to resolve this unit's billing owner." },
      { status: 500 },
    );
  }
}
