export const dynamic = "force-dynamic";
export const revalidate = 0;

import EstimateBuilder from "@/features/estimates/components/EstimateBuilder";
import { ESTIMATE_ADVISOR_ROLES } from "@/features/estimates/lib/access";
import type {
  EstimateCustomerForm,
  EstimateVehicleForm,
} from "@/features/estimates/types";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NewEstimatePageProps = {
  searchParams: Promise<{ customerId?: string; vehicleId?: string }>;
};

export default async function NewEstimatePage({
  searchParams,
}: NewEstimatePageProps) {
  const { profile } = await requireShopPageAccess({
    allowRoles: ESTIMATE_ADVISOR_ROLES,
    requiredCapability: "canAuthorizeQuotes",
  });
  const supabase = createServerSupabaseRSC();
  const requested = await searchParams;
  const requestedCustomerId = requested.customerId?.trim() ?? "";
  const requestedVehicleId = requested.vehicleId?.trim() ?? "";
  const customerId = UUID_PATTERN.test(requestedCustomerId)
    ? requestedCustomerId
    : null;
  const vehicleId = UUID_PATTERN.test(requestedVehicleId)
    ? requestedVehicleId
    : null;
  const shopPromise = supabase
    .from("shops")
    .select("labor_rate,timezone")
    .eq("id", profile.shop_id)
    .maybeSingle();

  let initialCustomer: EstimateCustomerForm | null = null;
  let initialVehicle: EstimateVehicleForm | null = null;
  if (customerId && vehicleId) {
    const [customerResult, vehicleResult] = await Promise.all([
      supabase
        .from("customers")
        .select(
          "id,business_name,name,first_name,last_name,phone,email,address,city,province,postal_code",
        )
        .eq("shop_id", profile.shop_id)
        .eq("id", customerId)
        .maybeSingle(),
      supabase
        .from("vehicles")
        .select(
          "id,customer_id,year,make,model,vin,license_plate,mileage,color,unit_number,engine_hours,engine,submodel,engine_family,engine_type,transmission,transmission_type,fuel_type,drivetrain",
        )
        .eq("shop_id", profile.shop_id)
        .eq("id", vehicleId)
        .eq("customer_id", customerId)
        .maybeSingle(),
    ]);

    if (
      !customerResult.error &&
      !vehicleResult.error &&
      customerResult.data &&
      vehicleResult.data
    ) {
      const customer = customerResult.data;
      const vehicle = vehicleResult.data;
      initialCustomer = {
        id: customer.id,
        business_name: customer.business_name,
        name: customer.name,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        city: customer.city,
        province: customer.province,
        postal_code: customer.postal_code,
      };
      initialVehicle = {
        id: vehicle.id,
        year: vehicle.year == null ? null : String(vehicle.year),
        make: vehicle.make,
        model: vehicle.model,
        vin: vehicle.vin,
        license_plate: vehicle.license_plate,
        mileage: vehicle.mileage,
        color: vehicle.color,
        unit_number: vehicle.unit_number,
        engine_hours:
          vehicle.engine_hours == null ? null : String(vehicle.engine_hours),
        engine: vehicle.engine,
        submodel: vehicle.submodel,
        engine_family: vehicle.engine_family,
        engine_type: vehicle.engine_type,
        transmission: vehicle.transmission,
        transmission_type: vehicle.transmission_type,
        fuel_type: vehicle.fuel_type,
        drivetrain: vehicle.drivetrain,
      };
    }
  }
  const { data: shop } = await shopPromise;

  return (
    <EstimateBuilder
      shopId={profile.shop_id}
      defaultLaborRate={Number(shop?.labor_rate ?? 0)}
      shopTimezone={shop?.timezone ?? "UTC"}
      initialCustomer={initialCustomer}
      initialVehicle={initialVehicle}
    />
  );
}
