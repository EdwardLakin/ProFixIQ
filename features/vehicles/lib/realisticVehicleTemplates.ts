export type VehicleTemplate = {
  make: string;
  model: string;
  trims: string[];
  powertrains: Array<{ engine: string; fuelType: string }>;
  driveTypes: string[];
  bodyType: string;
  assetType: "customer_vehicle" | "fleet_asset";
  mileageRange: [number, number];
  modelYearRange: [number, number];
};

export type DemoVehicleRow = {
  year: number;
  make: string;
  model: string;
  trim: string;
  engine: string;
  fuel_type: string;
  drive_type: string;
  body_type: string;
  asset_type: VehicleTemplate["assetType"];
  odometer: number;
  odometer_unit: "mi";
  purchase_date: string;
  in_service_date: string;
  last_service_date: string;
};

const gas = (engine: string) => ({ engine, fuelType: "Gasoline" });
const hybrid = (engine: string) => ({ engine, fuelType: "Hybrid" });
const diesel = (engine: string) => ({ engine, fuelType: "Diesel" });

export const PASSENGER_VEHICLE_TEMPLATES: VehicleTemplate[] = [
  { make: "Toyota", model: "Corolla", trims: ["L", "LE", "SE", "XSE"], powertrains: [gas("1.8L I4"), gas("2.0L I4"), hybrid("1.8L I4 Hybrid")], driveTypes: ["FWD"], bodyType: "Sedan", assetType: "customer_vehicle", mileageRange: [18000, 220000], modelYearRange: [2008, 2025] },
  { make: "Toyota", model: "RAV4", trims: ["LE", "XLE", "Adventure", "Limited"], powertrains: [gas("2.5L I4"), hybrid("2.5L I4 Hybrid")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 230000], modelYearRange: [2008, 2025] },
  { make: "Toyota", model: "Tacoma", trims: ["SR", "SR5", "TRD Off-Road", "Limited"], powertrains: [gas("2.7L I4"), gas("3.5L V6"), gas("2.4L Turbo I4")], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "customer_vehicle", mileageRange: [25000, 280000], modelYearRange: [2008, 2025] },
  { make: "Ford", model: "F-150", trims: ["XL", "XLT", "Lariat", "Platinum"], powertrains: [gas("2.7L EcoBoost V6"), gas("3.5L EcoBoost V6"), gas("5.0L V8"), hybrid("3.5L PowerBoost Hybrid V6")], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [25000, 260000], modelYearRange: [2009, 2025] },
  { make: "Ford", model: "Escape", trims: ["S", "SE", "SEL", "Titanium"], powertrains: [gas("1.5L EcoBoost I3"), gas("2.0L EcoBoost I4"), hybrid("2.5L I4 Hybrid")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 210000], modelYearRange: [2010, 2025] },
  { make: "Chevrolet", model: "Silverado 1500", trims: ["WT", "LT", "RST", "High Country"], powertrains: [gas("2.7L Turbo I4"), gas("5.3L V8"), gas("6.2L V8"), diesel("3.0L Duramax Diesel")], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [22000, 275000], modelYearRange: [2008, 2025] },
  { make: "Chevrolet", model: "Equinox", trims: ["LS", "LT", "RS", "Premier"], powertrains: [gas("1.5L Turbo I4"), gas("2.0L Turbo I4")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [16000, 220000], modelYearRange: [2010, 2025] },
  { make: "GMC", model: "Sierra 1500", trims: ["Pro", "SLE", "SLT", "Denali"], powertrains: [gas("2.7L Turbo I4"), gas("5.3L V8"), gas("6.2L V8"), diesel("3.0L Duramax Diesel")], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [22000, 275000], modelYearRange: [2008, 2025] },
  { make: "GMC", model: "Terrain", trims: ["SLE", "SLT", "AT4", "Denali"], powertrains: [gas("1.5L Turbo I4"), gas("2.0L Turbo I4")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [18000, 210000], modelYearRange: [2010, 2025] },
  { make: "Ram", model: "1500", trims: ["Tradesman", "Big Horn", "Laramie", "Limited"], powertrains: [gas("3.6L V6"), gas("5.7L HEMI V8"), diesel("3.0L EcoDiesel V6")], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [24000, 270000], modelYearRange: [2011, 2025] },
  { make: "Honda", model: "Civic", trims: ["LX", "EX", "Sport", "Touring"], powertrains: [gas("2.0L I4"), gas("1.5L Turbo I4")], driveTypes: ["FWD"], bodyType: "Sedan", assetType: "customer_vehicle", mileageRange: [16000, 230000], modelYearRange: [2008, 2025] },
  { make: "Honda", model: "Odyssey", trims: ["EX", "EX-L", "Touring", "Elite"], powertrains: [gas("3.5L V6")], driveTypes: ["FWD"], bodyType: "Van", assetType: "customer_vehicle", mileageRange: [20000, 260000], modelYearRange: [2008, 2025] },
  { make: "Nissan", model: "Altima", trims: ["S", "SV", "SR", "SL"], powertrains: [gas("2.5L I4"), gas("2.0L VC-Turbo I4")], driveTypes: ["FWD", "AWD"], bodyType: "Sedan", assetType: "customer_vehicle", mileageRange: [18000, 225000], modelYearRange: [2008, 2025] },
  { make: "Nissan", model: "Rogue", trims: ["S", "SV", "SL", "Platinum"], powertrains: [gas("2.5L I4"), gas("1.5L Turbo I3")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 220000], modelYearRange: [2010, 2025] },
  { make: "Hyundai", model: "Tucson", trims: ["SE", "SEL", "Limited", "N Line"], powertrains: [gas("2.5L I4"), hybrid("1.6L Turbo Hybrid I4")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [12000, 205000], modelYearRange: [2010, 2025] },
  { make: "Hyundai", model: "Santa Fe", trims: ["SE", "SEL", "Limited", "Calligraphy"], powertrains: [gas("2.4L I4"), gas("2.5L I4"), gas("2.0L Turbo I4"), hybrid("1.6L Turbo Hybrid I4")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 230000], modelYearRange: [2008, 2025] },
  { make: "Kia", model: "Sorento", trims: ["LX", "S", "EX", "SX"], powertrains: [gas("2.5L I4"), gas("2.5L Turbo I4"), hybrid("1.6L Turbo Hybrid I4")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [16000, 220000], modelYearRange: [2011, 2025] },
  { make: "Mazda", model: "CX-5", trims: ["Sport", "Touring", "Grand Touring", "Signature"], powertrains: [gas("2.5L I4"), gas("2.5L Turbo I4")], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 210000], modelYearRange: [2013, 2025] },
  { make: "Subaru", model: "Outback", trims: ["Base", "Premium", "Limited", "Touring"], powertrains: [gas("2.5L H4"), gas("2.4L Turbo H4")], driveTypes: ["AWD"], bodyType: "Wagon", assetType: "customer_vehicle", mileageRange: [18000, 240000], modelYearRange: [2010, 2025] },
];

export const HEAVY_DUTY_VEHICLE_TEMPLATES: VehicleTemplate[] = [
  { make: "Freightliner", model: "Cascadia", trims: ["Day Cab", "Sleeper"], powertrains: [diesel("Detroit DD13 Diesel"), diesel("Detroit DD15 Diesel")], driveTypes: ["6x4"], bodyType: "Heavy Truck", assetType: "fleet_asset", mileageRange: [120000, 850000], modelYearRange: [2014, 2025] },
  { make: "Kenworth", model: "T680", trims: ["Day Cab", "Sleeper"], powertrains: [diesel("PACCAR MX-13 Diesel"), diesel("Cummins X15 Diesel")], driveTypes: ["6x4"], bodyType: "Heavy Truck", assetType: "fleet_asset", mileageRange: [140000, 900000], modelYearRange: [2014, 2025] },
  { make: "Peterbilt", model: "567", trims: ["Dump", "Tractor", "Mixer"], powertrains: [diesel("PACCAR MX-13 Diesel"), diesel("Cummins X15 Diesel")], driveTypes: ["6x4", "8x4"], bodyType: "Heavy Truck", assetType: "fleet_asset", mileageRange: [90000, 650000], modelYearRange: [2015, 2025] },
  { make: "Isuzu", model: "NQR", trims: ["Standard Cab", "Crew Cab", "Box Truck"], powertrains: [diesel("5.2L I4 Diesel")], driveTypes: ["4x2"], bodyType: "Cab & Chassis", assetType: "fleet_asset", mileageRange: [45000, 380000], modelYearRange: [2008, 2025] },
];

export const REALISTIC_VEHICLE_TEMPLATES: VehicleTemplate[] = [
  ...PASSENGER_VEHICLE_TEMPLATES,
  ...HEAVY_DUTY_VEHICLE_TEMPLATES,
];

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length] as T;
}

function interpolate(range: [number, number], seed: number): number {
  const [min, max] = range;
  const ratio = ((seed * 37) % 100) / 100;
  return Math.round(min + (max - min) * ratio);
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildRealisticDemoVehicleRow(template: VehicleTemplate, seed = 0): DemoVehicleRow {
  const year = interpolate(template.modelYearRange, seed);
  const purchaseYear = Math.min(year + 1, 2025);
  const inServiceYear = purchaseYear;
  const lastServiceYear = Math.max(inServiceYear, Math.min(2026, purchaseYear + ((seed % 8) + 1)));
  const powertrain = pick(template.powertrains, seed + 1);

  return {
    year,
    make: template.make,
    model: template.model,
    trim: pick(template.trims, seed),
    engine: powertrain.engine,
    fuel_type: powertrain.fuelType,
    drive_type: pick(template.driveTypes, seed + 3),
    body_type: template.bodyType,
    asset_type: template.assetType,
    odometer: interpolate(template.mileageRange, seed + 4),
    odometer_unit: "mi",
    purchase_date: isoDate(purchaseYear, (seed % 12) + 1, 12),
    in_service_date: isoDate(inServiceYear, (seed % 12) + 1, 20),
    last_service_date: isoDate(lastServiceYear, ((seed + 5) % 12) + 1, 8),
  };
}

export function buildRealisticDemoVehicleRows(count = PASSENGER_VEHICLE_TEMPLATES.length, includeHeavyDuty = false): DemoVehicleRow[] {
  const templates = includeHeavyDuty ? REALISTIC_VEHICLE_TEMPLATES : PASSENGER_VEHICLE_TEMPLATES;
  return Array.from({ length: count }, (_, index) =>
    buildRealisticDemoVehicleRow(templates[index % templates.length] as VehicleTemplate, index),
  );
}
