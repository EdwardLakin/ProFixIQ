export type VehicleTemplate = {
  make: string;
  model: string;
  trims: string[];
  engines: string[];
  fuelTypes: string[];
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

export const PASSENGER_VEHICLE_TEMPLATES: VehicleTemplate[] = [
  { make: "Toyota", model: "Corolla", trims: ["L", "LE", "SE", "XSE"], engines: ["1.8L I4", "2.0L I4"], fuelTypes: ["Gasoline", "Hybrid"], driveTypes: ["FWD"], bodyType: "Sedan", assetType: "customer_vehicle", mileageRange: [18000, 220000], modelYearRange: [2008, 2025] },
  { make: "Toyota", model: "RAV4", trims: ["LE", "XLE", "Adventure", "Limited"], engines: ["2.5L I4", "2.5L I4 Hybrid"], fuelTypes: ["Gasoline", "Hybrid"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 230000], modelYearRange: [2008, 2025] },
  { make: "Toyota", model: "Tacoma", trims: ["SR", "SR5", "TRD Off-Road", "Limited"], engines: ["2.7L I4", "3.5L V6", "2.4L Turbo I4"], fuelTypes: ["Gasoline"], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "customer_vehicle", mileageRange: [25000, 280000], modelYearRange: [2008, 2025] },
  { make: "Ford", model: "F-150", trims: ["XL", "XLT", "Lariat", "Platinum"], engines: ["2.7L EcoBoost V6", "3.5L EcoBoost V6", "5.0L V8"], fuelTypes: ["Gasoline", "Hybrid"], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [25000, 260000], modelYearRange: [2009, 2025] },
  { make: "Ford", model: "Escape", trims: ["S", "SE", "SEL", "Titanium"], engines: ["1.5L EcoBoost I3", "2.0L EcoBoost I4", "2.5L I4 Hybrid"], fuelTypes: ["Gasoline", "Hybrid"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 210000], modelYearRange: [2010, 2025] },
  { make: "Chevrolet", model: "Silverado 1500", trims: ["WT", "LT", "RST", "High Country"], engines: ["2.7L Turbo I4", "5.3L V8", "6.2L V8", "3.0L Duramax Diesel"], fuelTypes: ["Gasoline", "Diesel"], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [22000, 275000], modelYearRange: [2008, 2025] },
  { make: "Chevrolet", model: "Equinox", trims: ["LS", "LT", "RS", "Premier"], engines: ["1.5L Turbo I4", "2.0L Turbo I4"], fuelTypes: ["Gasoline"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [16000, 220000], modelYearRange: [2010, 2025] },
  { make: "GMC", model: "Sierra 1500", trims: ["Pro", "SLE", "SLT", "Denali"], engines: ["2.7L Turbo I4", "5.3L V8", "6.2L V8", "3.0L Duramax Diesel"], fuelTypes: ["Gasoline", "Diesel"], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [22000, 275000], modelYearRange: [2008, 2025] },
  { make: "GMC", model: "Terrain", trims: ["SLE", "SLT", "AT4", "Denali"], engines: ["1.5L Turbo I4", "2.0L Turbo I4"], fuelTypes: ["Gasoline"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [18000, 210000], modelYearRange: [2010, 2025] },
  { make: "Ram", model: "1500", trims: ["Tradesman", "Big Horn", "Laramie", "Limited"], engines: ["3.6L V6", "5.7L HEMI V8", "3.0L EcoDiesel V6"], fuelTypes: ["Gasoline", "Diesel"], driveTypes: ["RWD", "4WD"], bodyType: "Pickup", assetType: "fleet_asset", mileageRange: [24000, 270000], modelYearRange: [2011, 2025] },
  { make: "Honda", model: "Civic", trims: ["LX", "EX", "Sport", "Touring"], engines: ["2.0L I4", "1.5L Turbo I4"], fuelTypes: ["Gasoline"], driveTypes: ["FWD"], bodyType: "Sedan", assetType: "customer_vehicle", mileageRange: [16000, 230000], modelYearRange: [2008, 2025] },
  { make: "Honda", model: "Odyssey", trims: ["EX", "EX-L", "Touring", "Elite"], engines: ["3.5L V6"], fuelTypes: ["Gasoline"], driveTypes: ["FWD"], bodyType: "Van", assetType: "customer_vehicle", mileageRange: [20000, 260000], modelYearRange: [2008, 2025] },
  { make: "Nissan", model: "Altima", trims: ["S", "SV", "SR", "SL"], engines: ["2.5L I4", "2.0L VC-Turbo I4"], fuelTypes: ["Gasoline"], driveTypes: ["FWD", "AWD"], bodyType: "Sedan", assetType: "customer_vehicle", mileageRange: [18000, 225000], modelYearRange: [2008, 2025] },
  { make: "Nissan", model: "Rogue", trims: ["S", "SV", "SL", "Platinum"], engines: ["2.5L I4", "1.5L Turbo I3"], fuelTypes: ["Gasoline"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 220000], modelYearRange: [2010, 2025] },
  { make: "Hyundai", model: "Tucson", trims: ["SE", "SEL", "Limited", "N Line"], engines: ["2.5L I4", "1.6L Turbo Hybrid I4"], fuelTypes: ["Gasoline", "Hybrid"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [12000, 205000], modelYearRange: [2010, 2025] },
  { make: "Kia", model: "Sorento", trims: ["LX", "S", "EX", "SX"], engines: ["2.5L I4", "2.5L Turbo I4", "1.6L Turbo Hybrid I4"], fuelTypes: ["Gasoline", "Hybrid"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [16000, 220000], modelYearRange: [2011, 2025] },
  { make: "Mazda", model: "CX-5", trims: ["Sport", "Touring", "Grand Touring", "Signature"], engines: ["2.5L I4", "2.5L Turbo I4"], fuelTypes: ["Gasoline"], driveTypes: ["FWD", "AWD"], bodyType: "SUV", assetType: "customer_vehicle", mileageRange: [15000, 210000], modelYearRange: [2013, 2025] },
  { make: "Subaru", model: "Outback", trims: ["Base", "Premium", "Limited", "Touring"], engines: ["2.5L H4", "2.4L Turbo H4"], fuelTypes: ["Gasoline"], driveTypes: ["AWD"], bodyType: "Wagon", assetType: "customer_vehicle", mileageRange: [18000, 240000], modelYearRange: [2010, 2025] },
];

export const HEAVY_DUTY_VEHICLE_TEMPLATES: VehicleTemplate[] = [
  { make: "Freightliner", model: "Cascadia", trims: ["Day Cab", "Sleeper"], engines: ["Detroit DD13 Diesel", "Detroit DD15 Diesel"], fuelTypes: ["Diesel"], driveTypes: ["6x4"], bodyType: "Heavy Truck", assetType: "fleet_asset", mileageRange: [120000, 850000], modelYearRange: [2014, 2025] },
  { make: "Kenworth", model: "T680", trims: ["Day Cab", "Sleeper"], engines: ["PACCAR MX-13 Diesel", "Cummins X15 Diesel"], fuelTypes: ["Diesel"], driveTypes: ["6x4"], bodyType: "Heavy Truck", assetType: "fleet_asset", mileageRange: [140000, 900000], modelYearRange: [2014, 2025] },
  { make: "Peterbilt", model: "567", trims: ["Dump", "Tractor", "Mixer"], engines: ["PACCAR MX-13 Diesel", "Cummins X15 Diesel"], fuelTypes: ["Diesel"], driveTypes: ["6x4", "8x4"], bodyType: "Heavy Truck", assetType: "fleet_asset", mileageRange: [90000, 650000], modelYearRange: [2015, 2025] },
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

  return {
    year,
    make: template.make,
    model: template.model,
    trim: pick(template.trims, seed),
    engine: pick(template.engines, seed + 1),
    fuel_type: pick(template.fuelTypes, seed + 2),
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
  const templates = includeHeavyDuty
    ? [...PASSENGER_VEHICLE_TEMPLATES, ...HEAVY_DUTY_VEHICLE_TEMPLATES]
    : PASSENGER_VEHICLE_TEMPLATES;
  return Array.from({ length: count }, (_, index) =>
    buildRealisticDemoVehicleRow(templates[index % templates.length] as VehicleTemplate, index),
  );
}
