// services/suggestions.ts
import masterServicesList from "@/features/inspections/lib/inspection/masterServicesList";

type VehicleCtx = {
  mileage?: number | null;          // as miles or km; see 'units'
  year?: number | null;
  isDiesel?: boolean;
  isHeavyDuty?: boolean;
  is4x4?: boolean;
  units?: "mi" | "km";              // default "km" if your shop is in Canada
};

const toMiles = (v: number, units: "mi" | "km") =>
  units === "km" ? v * 0.621371 : v;

// conservative default intervals (convert to mi internally)
const intervals = {
  oilGas: 5000,
  oilDiesel: 7500,
  rotate: 6000,
  brakeInspect: 6000,
  coolantFlush: 60000,
  brakeFluid: 30000,
  transServ: 60000,
  diff: 60000,
  tcase: 60000,
  airFilter: 15000,
  cabinFilter: 15000,
  sparkPlugs: 100000,
};

export function suggestServicesForVehicle(ctx: VehicleCtx): string[] {
  const mileageMi = ctx.mileage ? Math.max(0, Math.round(toMiles(ctx.mileage, ctx.units ?? "km"))) : 0;
  const ageYears = ctx.year ? new Date().getFullYear() - ctx.year : undefined;
  const isDiesel = !!ctx.isDiesel;
  const isHD = !!ctx.isHeavyDuty;
  const is4x4 = !!ctx.is4x4;

  const picks = new Set<string>();

  // --- quick helpers to pull canonical labels from the master list ---
  const pick = (needle: string) => {
    for (const cat of masterServicesList) {
      const hit = cat.items.find(i => i.item.toLowerCase() === needle.toLowerCase());
      if (hit) picks.add(hit.item);
    }
  };
  const pickStartsWith = (prefix: string) => {
    for (const cat of masterServicesList) {
      for (const it of cat.items) if (it.item.toLowerCase().startsWith(prefix.toLowerCase())) picks.add(it.item);
    }
  };

  // --- mileage based ---
  if (mileageMi >= (isDiesel ? intervals.oilDiesel : intervals.oilGas)) {
    pick(isDiesel ? "Engine oil and filter change (diesel)" : "Engine oil and filter change (gasoline)");
  }
  if (mileageMi !== 0 && mileageMi % intervals.rotate < 1000) {
    // near a rotation mark
    pickStartsWith("Tire rotation");
    pick("Tire inspection and pressure check");
    pick("Torque wheel lug nuts");
    pick("Wheel balance (as needed)");
  }
  if (mileageMi !== 0 && mileageMi % intervals.brakeInspect < 1000) {
    pickStartsWith("Brake inspection");
  }
  if (mileageMi >= intervals.airFilter) pick("Engine air filter replacement");
  if (mileageMi >= intervals.cabinFilter) pick("Cabin air filter replacement");

  // 4x4 driveline fluids
  if (is4x4 && mileageMi >= intervals.diff) {
    pick("Front differential service");
    pick("Rear differential service");
  }
  if (is4x4 && mileageMi >= intervals.tcase) pick("Transfer case service");

  // transmission
  if (mileageMi >= intervals.transServ) {
    pick("Transmission service (automatic)");
    pick("Transmission service (manual)");
  }

  // coolant & brake fluid (time or miles)
  if (mileageMi >= intervals.coolantFlush || (ageYears !== undefined && ageYears >= 5)) {
    pick("Coolant flush and fill");
  }
  if (mileageMi >= intervals.brakeFluid || (ageYears !== undefined && ageYears >= 3)) {
    pick("Brake fluid flush");
  }

  // diesel specifics
  if (isDiesel) {
    pick("Water separator drain/check");
    if (mileageMi >= 15000) pick("Diesel primary fuel filter replacement");
    if (mileageMi >= 30000) pick("Diesel secondary fuel filter replacement");
    pick("DEF tank fill and system check");
  }

  // heavy duty greasing cadence
  if (isHD || is4x4) {
    pick("Grease chassis (heavy-duty)");
  } else {
    pick("Grease chassis (automotive)");
  }

  // periodic general checks
  pick("Global scan + clear codes (report)");
  pick("Multi-point inspection (50-point)");
  pick("Battery/charging system test");

  // aging gasoline engines
  if (!isDiesel && mileageMi >= intervals.sparkPlugs) {
    picks.add("Spark plug replacement (as scheduled)"); // not in list; handled via inspection note
  }

  return Array.from(picks);
}