"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import type { Database } from "@shared/types/types/supabase";

type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];

export type CreateVehicleState = {
  ok: boolean;
  message: string | null;
};

const EMPTY_STATE: CreateVehicleState = { ok: false, message: null };

function cleanText(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length ? text : null;
}

function cleanYear(value: FormDataEntryValue | null): number | null {
  const text = cleanText(value);
  if (!text) return null;
  const year = Number.parseInt(text, 10);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  return year;
}

function normalizeVinForStorage(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeVinInput(value);
  return normalized.vin || value.toUpperCase();
}

export async function createVehicleAction(
  _prevState: CreateVehicleState = EMPTY_STATE,
  formData: FormData,
): Promise<CreateVehicleState> {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user?.id) return { ok: false, message: "You must be signed in to add a vehicle." };
  if (!actor.shopId) return { ok: false, message: "Your profile is not linked to a shop yet." };

  const customerId = cleanText(formData.get("customer_id"));
  const unitNumber = cleanText(formData.get("unit_number"));
  const vin = normalizeVinForStorage(cleanText(formData.get("vin")));
  const licensePlate = cleanText(formData.get("license_plate"))?.toUpperCase() ?? null;
  const year = cleanYear(formData.get("year"));
  const make = cleanText(formData.get("make"));
  const model = cleanText(formData.get("model"));

  if (!unitNumber && !vin && !licensePlate && !year && !make && !model) {
    return { ok: false, message: "Add at least one vehicle identifier or year/make/model value." };
  }

  if (customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("shop_id", actor.shopId)
      .maybeSingle();
    if (customerError) return { ok: false, message: "Unable to validate the selected customer." };
    if (!customer?.id) return { ok: false, message: "Selected customer does not belong to this shop." };
  }

  if (vin) {
    const { data: existingVin, error: vinError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", actor.shopId)
      .eq("vin", vin)
      .limit(1)
      .maybeSingle();
    if (vinError) return { ok: false, message: "Unable to check for duplicate VINs." };
    if (existingVin?.id) return { ok: false, message: "A vehicle with this VIN already exists in this shop." };
  }

  if (unitNumber) {
    const { data: existingUnit, error: unitError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", actor.shopId)
      .ilike("unit_number", unitNumber)
      .limit(1)
      .maybeSingle();
    if (unitError) return { ok: false, message: "Unable to check for duplicate unit numbers." };
    if (existingUnit?.id) return { ok: false, message: "A vehicle with this unit number already exists in this shop." };
  }

  const payload: VehicleInsert = {
    shop_id: actor.shopId,
    user_id: actor.user.id,
    customer_id: customerId,
    unit_number: unitNumber,
    vin,
    license_plate: licensePlate,
    year,
    make,
    model,
  };

  const { error } = await supabase.from("vehicles").insert(payload);
  if (error) return { ok: false, message: "Unable to add this vehicle right now." };

  revalidatePath("/vehicles");
  return { ok: true, message: "Vehicle added." };
}
