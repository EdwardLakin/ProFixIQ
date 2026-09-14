// features/work-orders/intake/server/intakeAccess.ts
//
// Authorization + subject-scope guards for the canonical work-order intake
// route (app/api/work-orders/[id]/intake/route.ts). Pulled out of the route
// file itself because Next.js route files may only export the handful of
// recognized Route fields (GET/POST/PUT/..., `dynamic`, `runtime`, etc.) —
// exporting anything else fails `next build` with "is not a valid Route
// export field", even though `tsc --noEmit` has no objection to it.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import type { IntakeMode, IntakeV1 } from "@/features/work-orders/intake/types";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

export type IntakeWorkOrderScope = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "shop_id" | "customer_id" | "vehicle_id"
>;

async function requireFleetIntakeAccess(params: {
  supabase: SupabaseClient<DB>;
  userId: string;
  workOrder: Pick<IntakeWorkOrderScope, "id" | "shop_id" | "vehicle_id">;
}): Promise<boolean> {
  const { supabase, userId, workOrder } = params;

  const actor = await resolveFleetActorContext(supabase, { userId });
  if (!actor.capabilities.canAccessFleetIntake) return false;

  if (actor.isInternal) {
    return actor.shopId === workOrder.shop_id;
  }

  if (!workOrder.vehicle_id) return false;

  const { data: fleetVehicles, error: fleetVehicleErr } = await supabase
    .from("fleet_vehicles")
    .select("fleet_id")
    .eq("vehicle_id", workOrder.vehicle_id);

  if (fleetVehicleErr || !fleetVehicles?.length) return false;

  const fleetIds = Array.from(
    new Set((fleetVehicles ?? []).map((row) => row.fleet_id).filter(Boolean)),
  );
  if (!fleetIds.length) return false;

  const { data: membership, error: membershipErr } = await supabase
    .from("fleet_members")
    .select("fleet_id")
    .eq("user_id", userId)
    .in("fleet_id", fleetIds)
    .limit(1)
    .maybeSingle();

  if (membershipErr || !membership?.fleet_id) return false;
  return true;
}

/**
 * Authorizes a request against a specific work order for the given intake
 * mode. Every method (GET/PUT/POST) must call this before reading or
 * writing intake data — mode alone (e.g. `?mode=app`) is caller-supplied
 * and must never be trusted as proof of access.
 */
export async function authorizeIntakeAccess(params: {
  mode: IntakeMode;
  workOrder: IntakeWorkOrderScope;
  fallbackSupabase: SupabaseClient<DB>;
}): Promise<
  | { ok: true; supabase: SupabaseClient<DB> }
  | { ok: false; response: NextResponse }
> {
  const { mode, workOrder, fallbackSupabase } = params;

  if (mode === "app") {
    const access = await requireShopScopedApiAccess({
      allowRoles: ROLE_GROUPS.workOrderManagers,
    });
    if (!access.ok) return { ok: false, response: access.response };
    if (access.profile.shop_id !== workOrder.shop_id) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, supabase: access.supabase };
  }

  if (mode === "portal") {
    try {
      const actor = await requirePortalCustomerActor(fallbackSupabase);
      if (
        !workOrder.customer_id ||
        actor.customer.id !== workOrder.customer_id
      ) {
        return {
          ok: false,
          response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }
      return { ok: true, supabase: fallbackSupabase };
    } catch (error) {
      if (error instanceof PortalAccessError) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: error.message },
            { status: error.status },
          ),
        };
      }
      // An unexpected failure here (DB/network error inside
      // requirePortalCustomerActor) is not proof the session is invalid —
      // reporting it as 401 would make a client treat an outage as a
      // logged-out state instead of retrying.
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Portal authorization is temporarily unavailable." },
          { status: 503 },
        ),
      };
    }
  }

  // fleet
  const {
    data: { user },
    error: authErr,
  } = await fallbackSupabase.auth.getUser();
  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }

  const canAccess = await requireFleetIntakeAccess({
    supabase: fallbackSupabase,
    userId: user.id,
    workOrder,
  });
  if (!canAccess) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  return { ok: true, supabase: fallbackSupabase };
}

/**
 * Rejects an intake payload that tries to move a work order to a different
 * customer, or attach a vehicle that doesn't belong to that customer.
 * Scanning/OCR and client-side dropdowns are untrusted input; the server
 * is the only place this is safe to enforce.
 *
 * The vehicle lookup runs on an admin (service-role) client rather than the
 * caller's own RLS-scoped client. `vehicles` SELECT policies only admit a
 * staff/profile shop identity — a portal customer's own client legitimately
 * cannot read the row here even when it really does belong to them — and by
 * this point `authorizeIntakeAccess` has already established that the
 * caller may act on `workOrder`, so this lookup only needs to confirm the
 * requested vehicle is actually that work order's customer's, not re-derive
 * the caller's identity.
 */
export async function verifyIntakeSubjectScope(params: {
  workOrder: IntakeWorkOrderScope;
  intake: IntakeV1;
}): Promise<NextResponse | null> {
  const { workOrder, intake } = params;
  const subjectCustomerId = intake.subject.customer_id || null;
  const subjectVehicleId = intake.subject.vehicle_id || null;

  if (
    workOrder.customer_id &&
    subjectCustomerId &&
    subjectCustomerId !== workOrder.customer_id
  ) {
    return NextResponse.json(
      { error: "Intake cannot change the customer linked to this work order." },
      { status: 403 },
    );
  }

  if (subjectVehicleId && workOrder.customer_id) {
    const admin = createAdminSupabase();
    const { data: vehicle, error: vehicleErr } = await admin
      .from("vehicles")
      .select("id, customer_id, shop_id")
      .eq("id", subjectVehicleId)
      .maybeSingle();

    if (vehicleErr) {
      return NextResponse.json({ error: vehicleErr.message }, { status: 500 });
    }
    if (
      !vehicle ||
      vehicle.customer_id !== workOrder.customer_id ||
      vehicle.shop_id !== workOrder.shop_id
    ) {
      return NextResponse.json(
        { error: "The selected vehicle does not belong to this work order's customer." },
        { status: 403 },
      );
    }
  }

  return null;
}
