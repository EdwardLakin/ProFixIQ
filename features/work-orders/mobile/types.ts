export type MobileCustomer = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

export type MobileVehicle = {
  id: string | null;
  vin: string | null;
  year: string | number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  mileage: string | null;
  color: string | null; // required because desktop Vehicle has color
};