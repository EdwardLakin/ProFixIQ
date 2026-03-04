import type { IntakeV1 } from "./types";
import { makeIntakeDefaults } from "./defaults";

export type CustomerProfile = {
  customer_id: string;
  contact_id?: string | null;
  preferred_contact?: "phone" | "text" | "email" | "portal" | null;
  vehicles: Array<{ vehicle_id: string; unit_number?: string | null; label?: string | null }>;
};

export function pickDefaultVehicleId(profile: CustomerProfile): string | null {
  if (!profile.vehicles?.length) return null;
  if (profile.vehicles.length === 1) return profile.vehicles[0].vehicle_id;
  // If multiple, you can later prefer "last_used_vehicle_id" if you store it.
  return null;
}

export function buildPrefilledIntake(params: {
  profile: CustomerProfile;
  selected_vehicle_id?: string | null;
}): IntakeV1 {
  const vehicle_id =
    params.selected_vehicle_id ??
    pickDefaultVehicleId(params.profile) ??
    params.profile.vehicles?.[0]?.vehicle_id;

  if (!vehicle_id) {
    return makeIntakeDefaults({
      customer_id: params.profile.customer_id,
      vehicle_id: "MISSING_VEHICLE",
      contact_id: params.profile.contact_id ?? null,
      preferred_contact: params.profile.preferred_contact ?? null,
    });
  }

  const vehicle = params.profile.vehicles.find((v) => v.vehicle_id === vehicle_id);

  const intake = makeIntakeDefaults({
    customer_id: params.profile.customer_id,
    vehicle_id,
    contact_id: params.profile.contact_id ?? null,
    preferred_contact: params.profile.preferred_contact ?? null,
  });

  if (vehicle?.unit_number) intake.subject.unit_number = vehicle.unit_number;

  // keep defaults simple; user will select
  intake.symptoms.types = ["other"];
  intake.symptoms.primary_system = "other";

  return intake;
}

export function makeVehicleLabel(v: {
  label?: string | null;
  unit_number?: string | null;
  vehicle_id: string;
}) {
  const parts: string[] = [];
  if (v.label) parts.push(v.label);
  if (v.unit_number) parts.push(`Unit ${v.unit_number}`);
  if (!parts.length) parts.push(v.vehicle_id.slice(0, 8));
  return parts.join(" • ");
}
