// features/inspections/lib/inspection/inspectionCustomerVehicleContext.ts
//
// Resolves the Customer/Fleet and Vehicle context shown on the inspection
// screen. A brand-new inspection carries this as setup-wizard URL params,
// but reopening an *existing* inspection tied to a work order (the normal
// technician flow) never carried those params even though the work order
// already has an authoritative customer/vehicle relationship. These helpers
// let the screen fall back to that relationship — read through the existing
// `/api/work-order-lines/[id]/workspace-detail` route already used by the
// focused job screen — without introducing a new lookup workflow.

import type { SessionCustomer, SessionVehicle } from "./types";

export function hasCustomerContext(c: SessionCustomer): boolean {
  return Boolean(
    c.business_name ||
      c.name ||
      c.first_name ||
      c.last_name ||
      c.phone ||
      c.email,
  );
}

export function hasVehicleContext(v: SessionVehicle): boolean {
  return Boolean(v.year || v.make || v.model || v.vin || v.license_plate);
}

/** Shape returned by the existing `/api/work-order-lines/[id]/workspace-detail`
 * route — the same authoritative customer/vehicle relationship the focused
 * job screen already reads. Only the fields this screen displays are typed. */
export type WorkOrderLineDetailForContext = {
  customer?: {
    business_name?: string | null;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    phone_number?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
  } | null;
  vehicle?: {
    year?: number | string | null;
    make?: string | null;
    model?: string | null;
    vin?: string | null;
    license_plate?: string | null;
    mileage?: string | null;
    color?: string | null;
    unit_number?: string | null;
    engine_hours?: number | string | null;
  } | null;
};

export function toSessionCustomerFromRecord(
  c: NonNullable<WorkOrderLineDetailForContext["customer"]>,
): SessionCustomer {
  return {
    business_name: c.business_name ?? "",
    name: c.name ?? "",
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    phone: c.phone ?? c.phone_number ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    province: c.province ?? "",
    postal_code: c.postal_code ?? "",
  };
}

export function toSessionVehicleFromRecord(
  v: NonNullable<WorkOrderLineDetailForContext["vehicle"]>,
): SessionVehicle {
  return {
    year: v.year != null ? String(v.year) : "",
    make: v.make ?? "",
    model: v.model ?? "",
    vin: v.vin ?? "",
    license_plate: v.license_plate ?? "",
    mileage: v.mileage ?? "",
    color: v.color ?? "",
    unit_number: v.unit_number ?? "",
    engine_hours: v.engine_hours != null ? String(v.engine_hours) : "",
  };
}
