import { NextResponse } from "next/server";
import type { Json } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  ESTIMATE_ADVISOR_ROLES,
  ESTIMATE_VIEW_ROLES,
} from "@/features/estimates/lib/access";
import { loadEstimateList } from "@/features/estimates/server/data";
import { createEstimateSchema } from "@/features/estimates/server/schemas";
import {
  estimateMutationError,
  nullableRpcString,
  requireIdempotencyKey,
} from "@/features/estimates/server/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: ESTIMATE_VIEW_ROLES,
  });
  if (!access.ok) return access.response;

  try {
    const payload = await loadEstimateList({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      role: access.canonicalRole,
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load estimates.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ESTIMATE_ADVISOR_ROLES,
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) return access.response;

  const idempotency = requireIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const parsed = createEstimateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid estimate.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const customer: Json = {
    id: input.customer.id ?? null,
    businessName: input.customer.business_name ?? null,
    name: input.customer.name ?? null,
    firstName: input.customer.first_name ?? null,
    lastName: input.customer.last_name ?? null,
    email: input.customer.email || null,
    phone: input.customer.phone ?? null,
    address: input.customer.address ?? null,
    city: input.customer.city ?? null,
    province: input.customer.province ?? null,
    postalCode: input.customer.postal_code ?? null,
  };
  const vehicle: Json = {
    id: input.vehicle.id ?? null,
    year: input.vehicle.year ?? null,
    make: input.vehicle.make ?? null,
    model: input.vehicle.model ?? null,
    vin: input.vehicle.vin ?? null,
    licensePlate: input.vehicle.license_plate ?? null,
    mileage: input.vehicle.mileage ?? null,
    unitNumber: input.vehicle.unit_number ?? null,
    color: input.vehicle.color ?? null,
    engine: input.vehicle.engine ?? null,
    transmission: input.vehicle.transmission ?? null,
    fuelType: input.vehicle.fuel_type ?? null,
    drivetrain: input.vehicle.drivetrain ?? null,
  };
  const lines: Json = input.lines.map((line) => ({
    clientKey: line.clientKey,
    title: line.title,
    customerDescription: line.customerDescription,
    advisorNotes: line.advisorNotes,
    laborHours: line.laborHours,
    laborRate: line.laborRate,
    parts: line.parts.map((part) => ({
      clientKey: part.clientKey,
      description: part.description,
      quantity: part.quantity,
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
    })),
  }));

  const { data, error } = await access.supabase.rpc("create_estimate_atomic", {
    p_shop_id: access.profile.shop_id,
    p_customer: customer,
    p_vehicle: vehicle,
    p_lines: lines,
    p_notes: nullableRpcString(input.notes),
    p_expires_at: nullableRpcString(input.expiresAt),
    p_idempotency_key: idempotency.key,
  });

  if (error) return estimateMutationError(error);
  return NextResponse.json(data, { status: 201 });
}
