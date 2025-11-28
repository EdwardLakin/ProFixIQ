// features/work-orders/mobile/types.ts

export type MobileCustomer = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  business_name?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

export type MobileVehicle = {
  id: string | null;

  // optional because mobile does NOT input this
  vin?: string | null;

  year: string | number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  mileage: string | null;

  // optional in mobile UI
  color?: string | null;
  unit_number?: string | null;
  engine_hours?: string | number | null;
};