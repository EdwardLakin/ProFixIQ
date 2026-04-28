import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import type { Database } from "@/features/shared/types/types/supabase";

type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

type ResolveAction = "link" | "skip";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function customerLabel(row: Pick<CustomerRow, "business_name" | "first_name" | "last_name" | "name" | "email" | "phone" | "phone_number"> | null): string {
  if (!row) return "Unknown customer";
  return text(row.business_name)
    ?? text(`${row.first_name ?? ""} ${row.last_name ?? ""}`)
    ?? text(row.name)
    ?? text(row.email)
    ?? text(row.phone ?? row.phone_number)
    ?? "Unknown customer";
}

function vehicleLabel(row: Pick<VehicleRow, "year" | "make" | "model" | "vin" | "license_plate" | "unit_number"> | null): string {
  if (!row) return "Unknown vehicle";
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ").trim();
  if (row.vin) return ymm ? `${ymm} — VIN ${row.vin}` : `VIN ${row.vin}`;
  if (row.license_plate) return ymm ? `${ymm} — Plate ${row.license_plate}` : `Plate ${row.license_plate}`;
  if (row.unit_number) return ymm ? `${ymm} — Unit ${row.unit_number}` : `Unit ${row.unit_number}`;
  return ymm || "Unknown vehicle";
}

export async function resolveCustomerVehicleLink(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  actorId: string;
  reviewItemId?: string;
  stagedLinkId?: string;
  action: ResolveAction;
  selectedCustomerId?: string;
}) {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  if (!params.reviewItemId && !params.stagedLinkId) {
    throw new Error("reviewItemId or stagedLinkId is required");
  }
  if (params.action === "link" && !params.selectedCustomerId) {
    throw new Error("selectedCustomerId is required when action='link'");
  }

  let reviewQuery = sb
    .from("onboarding_review_items")
    .select("id, shop_id, session_id, status, details, link_id, issue_type")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("issue_type", "unresolved_customer_vehicle_link");
  if (params.reviewItemId) reviewQuery = reviewQuery.eq("id", params.reviewItemId);
  if (params.stagedLinkId) reviewQuery = reviewQuery.eq("link_id", params.stagedLinkId);

  const { data: reviewItem, error: reviewError } = await reviewQuery.maybeSingle();
  if (reviewError) throw new Error(reviewError.message);
  if (!reviewItem) throw new Error("Review item not found");

  const details = asRecord(reviewItem.details);
  const liveVehicleId = text(details.liveVehicleId);
  if (!liveVehicleId) {
    throw new Error("Review item is missing a materialized live vehicle target");
  }

  const { data: vehicle, error: vehicleError } = await sb
    .from("vehicles")
    .select("id, shop_id, customer_id, year, make, model, vin, license_plate, unit_number")
    .eq("shop_id", params.shopId)
    .eq("id", liveVehicleId)
    .maybeSingle();
  if (vehicleError) throw new Error(vehicleError.message);
  if (!vehicle) throw new Error("Vehicle not found in shop");

  if (params.action === "skip") {
    const { error: updateError } = await sb
      .from("onboarding_review_items")
      .update({
        status: "skipped",
        resolved_at: new Date().toISOString(),
        resolved_by: params.actorId,
        summary: "Operator marked unresolved customer/vehicle link as do not link.",
        details: {
          ...details,
          resolution: {
            action: "skip",
            resolvedBy: params.actorId,
            resolvedAt: new Date().toISOString(),
          },
        },
      })
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .eq("id", reviewItem.id);
    if (updateError) throw new Error(updateError.message);

    return {
      ok: true as const,
      action: "skip" as const,
      vehicleId: vehicle.id,
      customerId: vehicle.customer_id,
      customerLabel: null,
      vehicleLabel: vehicleLabel(vehicle),
      reviewItemStatus: "skipped",
      warning: "Link was skipped by operator.",
    };
  }

  const selectedCustomerId = String(params.selectedCustomerId);
  const { data: customer, error: customerError } = await sb
    .from("customers")
    .select("id, shop_id, business_name, first_name, last_name, name, email, phone, phone_number")
    .eq("shop_id", params.shopId)
    .eq("id", selectedCustomerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new Error("Selected customer not found in shop");

  if (vehicle.customer_id && vehicle.customer_id !== selectedCustomerId) {
    throw new Error("Vehicle is already linked to a different customer; replace is not supported");
  }

  let warning: string | null = null;
  if (!vehicle.customer_id) {
    const { error: linkError } = await sb
      .from("vehicles")
      .update({ customer_id: selectedCustomerId })
      .eq("shop_id", params.shopId)
      .eq("id", vehicle.id)
      .is("customer_id", null);
    if (linkError) throw new Error(linkError.message);
  } else {
    warning = "Vehicle was already linked to this customer. No change applied.";
  }

  const { error: reviewUpdateError } = await sb
    .from("onboarding_review_items")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: params.actorId,
      summary: `Operator linked vehicle to ${customerLabel(customer)}.`,
      details: {
        ...details,
        resolution: {
          action: "link",
          selectedCustomerId,
          selectedCustomerLabel: customerLabel(customer),
          resolvedBy: params.actorId,
          resolvedAt: new Date().toISOString(),
        },
      },
    })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("id", reviewItem.id);
  if (reviewUpdateError) throw new Error(reviewUpdateError.message);

  return {
    ok: true as const,
    action: "link" as const,
    vehicleId: vehicle.id,
    customerId: customer.id,
    customerLabel: customerLabel(customer),
    vehicleLabel: vehicleLabel(vehicle),
    reviewItemStatus: "resolved",
    warning,
  };
}
