import { findMenuRepairItemForWorkOrderLine } from "@/features/menu-repair-items/server/findMenuRepairItemForWorkOrderLine";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { loadDeferredWorkHistoryForVehicle } from "@/features/work-orders/server/deferredWorkHistory";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { Database } from "@shared/types/types/supabase";
import {
  buildPartsReadinessForMenuRepairItems,
  type PartReadinessLine,
} from "./buildPartsReadiness";

type DB = Database;
type Booking = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  "id" | "starts_at" | "status" | "customer_id" | "vehicle_id" | "notes"
>;
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type MenuRepairItem = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  "id" | "name" | "labor_hours" | "price_estimate" | "is_active"
>;

export type VehicleSnapshot = {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  licensePlate: string | null;
  unitNumber: string | null;
  mileage: string | null;
  drivetrain: string | null;
  engine: string | null;
  fuelType: string | null;
  transmission: string | null;
  notes: string | null;
};

export type CustomerSnapshot = {
  name: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  isFleet: boolean;
};

export type MatchedMenuItem = {
  menuRepairItemId: string;
  name: string;
  laborHours: number | null;
  priceEstimate: number | null;
  isActive: boolean;
  sourceRootLineId: string;
  partsReadiness: PartReadinessLine[];
};

export type MissingInfoFlag =
  | "missing_vehicle"
  | "missing_customer"
  | "missing_vin"
  | "missing_mileage"
  | "missing_customer_contact";

export type AppointmentPreparation = {
  bookingId: string;
  shopId: string;
  startsAt: string;
  vehicleId: string | null;
  customerId: string | null;
  vehicleSnapshot: VehicleSnapshot | null;
  customerSnapshot: CustomerSnapshot | null;
  deferredItems: Awaited<
    ReturnType<typeof loadDeferredWorkHistoryForVehicle>
  >["items"];
  matchedMenuItems: MatchedMenuItem[];
  missingInfo: MissingInfoFlag[];
};

export type BuildAppointmentPreparationsResult = {
  preparations: AppointmentPreparation[];
  /**
   * Bookings whose data could not be fully assembled this run (a dependency
   * query failed). The sync must not resolve or overwrite any existing
   * preparation for these — better a stale-but-complete record than a fresh
   * one silently missing outstanding history or readiness.
   */
  failedBookingIds: string[];
  errors: string[];
};

function buildVehicleSnapshot(vehicle: Vehicle): VehicleSnapshot {
  return {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    vin: vehicle.vin,
    licensePlate: vehicle.license_plate,
    unitNumber: vehicle.unit_number,
    mileage: vehicle.mileage,
    drivetrain: vehicle.drivetrain,
    engine: vehicle.engine,
    fuelType: vehicle.fuel_type,
    transmission: vehicle.transmission,
    notes: vehicle.notes,
  };
}

function buildCustomerSnapshot(customer: Customer): CustomerSnapshot {
  const name =
    customer.name?.trim() ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
    null;
  return {
    name: name || null,
    businessName: customer.business_name,
    email: customer.email,
    phone: customer.phone ?? customer.phone_number,
    isFleet: customer.is_fleet,
  };
}

function computeMissingInfo(input: {
  vehicle: Vehicle | null;
  customer: Customer | null;
}): MissingInfoFlag[] {
  const flags: MissingInfoFlag[] = [];
  if (!input.vehicle) {
    flags.push("missing_vehicle");
  } else {
    if (!input.vehicle.vin?.trim()) flags.push("missing_vin");
    if (!input.vehicle.mileage?.trim()) flags.push("missing_mileage");
  }

  if (!input.customer) {
    flags.push("missing_customer");
  } else if (!input.customer.email?.trim() && !input.customer.phone?.trim() && !input.customer.phone_number?.trim()) {
    flags.push("missing_customer_contact");
  }

  return flags;
}

/**
 * Assemble read-only appointment preparation projections for a batch of
 * upcoming bookings: vehicle/customer context, still-outstanding
 * deferred/declined history, any matching known menu repair for that
 * history, and parts readiness for those matches. This never creates
 * findings, approvals, orders, or punchable work — it only summarizes
 * existing data for human review (Phase 4 of the dashboard assistant plan).
 */
export async function buildAppointmentPreparations(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  bookings: Booking[];
  canViewPricing?: boolean;
}): Promise<BuildAppointmentPreparationsResult> {
  const { admin, shopId, bookings, canViewPricing = true } = input;
  if (bookings.length === 0) {
    return { preparations: [], failedBookingIds: [], errors: [] };
  }

  const vehicleIds = [
    ...new Set(bookings.map((b) => b.vehicle_id).filter((id): id is string => Boolean(id))),
  ];
  const customerIds = [
    ...new Set(bookings.map((b) => b.customer_id).filter((id): id is string => Boolean(id))),
  ];

  const [vehicleRows, customerRows] = await Promise.all([
    vehicleIds.length
      ? loadRowsForIdChunks<Vehicle>(vehicleIds, (ids, from, to) =>
          admin
            .from("vehicles")
            .select("*")
            .eq("shop_id", shopId)
            .in("id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as Vehicle[]),
    customerIds.length
      ? loadRowsForIdChunks<Customer>(customerIds, (ids, from, to) =>
          admin
            .from("customers")
            .select("*")
            // A booking's customer_id has no DB-enforced same-shop
            // constraint, so an admin (RLS-bypassing) read must scope by
            // shop_id itself or it could leak another tenant's customer
            // record into this shop's snapshot.
            .eq("shop_id", shopId)
            .in("id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as Customer[]),
  ]);

  const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));
  const customerById = new Map(customerRows.map((c) => [c.id, c]));

  // Deferred/declined history is keyed by vehicle, not by booking, so it is
  // loaded once per distinct vehicle rather than once per booking. A
  // per-vehicle failure only invalidates the bookings for that vehicle, not
  // the whole run.
  const errors: string[] = [];
  const failedVehicleIds = new Set<string>();
  const deferredByVehicleId = new Map<
    string,
    Awaited<ReturnType<typeof loadDeferredWorkHistoryForVehicle>>["items"]
  >();
  for (const vehicleId of vehicleIds) {
    const { items, error } = await loadDeferredWorkHistoryForVehicle({
      admin,
      shopId,
      vehicleId,
      canViewPricing,
    });
    if (error) {
      failedVehicleIds.add(vehicleId);
      errors.push(`vehicle ${vehicleId}: ${error}`);
      continue;
    }
    deferredByVehicleId.set(vehicleId, items);
  }

  // Match every deferred/declined root line against a known menu repair item
  // using the same lookup the work-order workflow already relies on, so
  // this never invents a second matching heuristic.
  const menuRepairItemIdByRootLineId = new Map<string, string>();
  const allRootLineIds = [
    ...new Set(
      [...deferredByVehicleId.values()]
        .flat()
        .map((item) => item.rootLineId),
    ),
  ];
  for (const rootLineId of allRootLineIds) {
    const menuRepairItemId = await findMenuRepairItemForWorkOrderLine({
      supabase: admin,
      workOrderLineId: rootLineId,
    });
    if (menuRepairItemId) menuRepairItemIdByRootLineId.set(rootLineId, menuRepairItemId);
  }

  const matchedMenuRepairItemIds = [...new Set(menuRepairItemIdByRootLineId.values())];
  const [menuRepairItemRows, partsReadinessResult] = await Promise.all([
    matchedMenuRepairItemIds.length
      ? loadRowsForIdChunks<MenuRepairItem>(matchedMenuRepairItemIds, (ids, from, to) =>
          admin
            .from("menu_repair_items")
            .select("id, name, labor_hours, price_estimate, is_active")
            .eq("shop_id", shopId)
            .in("id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as MenuRepairItem[]),
    buildPartsReadinessForMenuRepairItems({
      admin,
      shopId,
      menuRepairItemIds: matchedMenuRepairItemIds,
    }),
  ]);
  const menuRepairItemById = new Map(menuRepairItemRows.map((r) => [r.id, r]));

  // Parts readiness is computed once for the whole shop batch, not per
  // vehicle, so a failure there can't be pinned to specific vehicles the way
  // a deferred-history failure can. Treat it as invalidating every booking
  // that has a vehicle with matched history (the only bookings whose
  // readiness data it would have supplied) rather than publishing readiness
  // that silently defaulted to "unmatched".
  if (partsReadinessResult.error) {
    errors.push(`parts readiness: ${partsReadinessResult.error}`);
    for (const vehicleId of deferredByVehicleId.keys()) {
      failedVehicleIds.add(vehicleId);
    }
  }
  const partsReadinessByMenuRepairItemId = partsReadinessResult.readinessByMenuRepairItemId;

  const preparations: AppointmentPreparation[] = [];
  const failedBookingIds: string[] = [];

  for (const booking of bookings) {
    if (booking.vehicle_id && failedVehicleIds.has(booking.vehicle_id)) {
      failedBookingIds.push(booking.id);
      continue;
    }

    const vehicle = booking.vehicle_id ? vehicleById.get(booking.vehicle_id) ?? null : null;
    const customer = booking.customer_id ? customerById.get(booking.customer_id) ?? null : null;
    const deferredItems = booking.vehicle_id
      ? deferredByVehicleId.get(booking.vehicle_id) ?? []
      : [];

    const matchedMenuItems: MatchedMenuItem[] = [];
    for (const item of deferredItems) {
      const menuRepairItemId = menuRepairItemIdByRootLineId.get(item.rootLineId);
      if (!menuRepairItemId) continue;
      const menuRepairItem = menuRepairItemById.get(menuRepairItemId);
      if (!menuRepairItem) continue;
      matchedMenuItems.push({
        menuRepairItemId,
        name: menuRepairItem.name,
        laborHours: menuRepairItem.labor_hours,
        priceEstimate: menuRepairItem.price_estimate,
        isActive: menuRepairItem.is_active,
        sourceRootLineId: item.rootLineId,
        partsReadiness: partsReadinessByMenuRepairItemId.get(menuRepairItemId) ?? [],
      });
    }

    preparations.push({
      bookingId: booking.id,
      shopId,
      startsAt: booking.starts_at,
      vehicleId: booking.vehicle_id,
      customerId: booking.customer_id,
      vehicleSnapshot: vehicle ? buildVehicleSnapshot(vehicle) : null,
      customerSnapshot: customer ? buildCustomerSnapshot(customer) : null,
      deferredItems,
      matchedMenuItems,
      missingInfo: computeMissingInfo({ vehicle, customer }),
    });
  }

  return { preparations, failedBookingIds, errors };
}
