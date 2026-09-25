/**
 * Canonical maintenance service codes shared by generated schedules and
 * service-history matching. Generated schedules are asked to use these codes
 * so the same service keeps the same code across vehicles, and the aliases
 * let completed work that a technician typed by hand ("LOF", "rotate tires")
 * count as history for the matching service.
 */
export type MaintenanceCatalogEntry = {
  code: string;
  label: string;
  aliases: string[];
};

export const MAINTENANCE_SERVICE_CATALOG: MaintenanceCatalogEntry[] = [
  {
    code: "OIL_CHANGE",
    label: "Engine oil & filter change",
    aliases: ["oil change", "oil and filter", "oil filter change", "lof", "lube oil filter", "engine oil service"],
  },
  {
    code: "TIRE_ROTATION",
    label: "Tire rotation",
    aliases: ["tire rotation", "rotate tires", "tyre rotation", "rotate tyres"],
  },
  {
    code: "ENGINE_AIR_FILTER",
    label: "Engine air filter replacement",
    aliases: ["engine air filter", "air filter"],
  },
  {
    code: "CABIN_AIR_FILTER",
    label: "Cabin air filter replacement",
    aliases: ["cabin air filter", "cabin filter", "pollen filter"],
  },
  {
    code: "FUEL_FILTER",
    label: "Fuel filter replacement",
    aliases: ["fuel filter"],
  },
  {
    code: "SPARK_PLUGS",
    label: "Spark plug replacement",
    aliases: ["spark plugs", "spark plug", "plugs replaced"],
  },
  {
    code: "TRANS_SERVICE",
    label: "Transmission fluid service",
    aliases: ["transmission service", "transmission fluid", "trans service", "trans fluid", "atf service", "atf flush"],
  },
  {
    code: "TRANSFER_CASE_SERVICE",
    label: "Transfer case fluid service",
    aliases: ["transfer case", "t case fluid"],
  },
  {
    code: "FRONT_DIFF_SERVICE",
    label: "Front differential fluid service",
    aliases: ["front diff", "front differential"],
  },
  {
    code: "REAR_DIFF_SERVICE",
    label: "Rear differential fluid service",
    aliases: ["rear diff", "rear differential"],
  },
  {
    code: "COOLANT_SERVICE",
    label: "Coolant flush",
    aliases: ["coolant flush", "coolant service", "coolant exchange", "antifreeze flush", "cooling system flush"],
  },
  {
    code: "BRAKE_FLUID_FLUSH",
    label: "Brake fluid flush",
    aliases: ["brake fluid flush", "brake fluid service", "brake flush", "brake fluid exchange"],
  },
  {
    code: "BRAKE_INSPECTION",
    label: "Brake inspection and adjustment",
    aliases: ["brake inspection", "brake adjustment", "adjust brakes", "brake check"],
  },
  {
    code: "POWER_STEERING_SERVICE",
    label: "Power steering fluid service",
    aliases: ["power steering fluid", "power steering flush", "power steering service"],
  },
  {
    code: "SERPENTINE_BELT",
    label: "Drive belt replacement",
    aliases: ["serpentine belt", "drive belt", "accessory belt"],
  },
  {
    code: "TIMING_BELT",
    label: "Timing belt replacement",
    aliases: ["timing belt"],
  },
  {
    code: "WHEEL_BEARING_SERVICE",
    label: "Wheel bearing inspection and repack",
    aliases: ["wheel bearing", "bearing repack", "repack bearings", "hub service"],
  },
  {
    code: "CHASSIS_LUBE",
    label: "Chassis lubrication",
    aliases: ["chassis lube", "grease chassis", "lube chassis", "greasing", "grease job"],
  },
  {
    code: "SUSPENSION_INSPECTION",
    label: "Suspension and steering inspection",
    aliases: ["suspension inspection", "steering inspection", "front end inspection"],
  },
  {
    code: "LIGHTING_INSPECTION",
    label: "Lighting and electrical inspection",
    aliases: ["lighting inspection", "light check", "lights inspection"],
  },
  {
    code: "SAFETY_INSPECTION",
    label: "Annual safety inspection",
    aliases: ["safety inspection", "annual inspection", "cvip", "dot inspection", "cvsa inspection"],
  },
];

const CATALOG_BY_CODE = new Map(
  MAINTENANCE_SERVICE_CATALOG.map((entry) => [entry.code, entry]),
);

export function normalizeServiceText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `phrase` appears in `text` as whole words (both normalized). */
export function containsPhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Maps a generated service code/label to its catalog code when it names a
 * catalog service; otherwise returns the normalized code unchanged.
 */
export function canonicalizeServiceCode(
  code: string,
  label?: string | null,
): string {
  const normalized = normalizeCode(code);
  if (CATALOG_BY_CODE.has(normalized)) return normalized;

  const candidates = [normalizeServiceText(label), normalizeServiceText(code)];
  for (const text of candidates) {
    if (!text) continue;
    // Longest alias first so "brake fluid flush" wins over "brake".
    let best: { code: string; length: number } | null = null;
    for (const entry of MAINTENANCE_SERVICE_CATALOG) {
      for (const alias of [normalizeServiceText(entry.label), ...entry.aliases]) {
        if (containsPhrase(text, alias) && (!best || alias.length > best.length)) {
          best = { code: entry.code, length: alias.length };
        }
      }
    }
    if (best) return best.code;
  }

  return normalized;
}

/**
 * True when a completed line's description names the given service: either
 * it resolves to the same catalog code (so "LOF" counts as OIL_CHANGE, and a
 * cabin filter does not count as an engine air filter), or it contains the
 * service's own label.
 */
export function descriptionMatchesService(
  description: string | null | undefined,
  serviceCode: string,
  label: string,
): boolean {
  const text = normalizeServiceText(description);
  if (!text) return false;
  if (canonicalizeServiceCode("", description) === serviceCode) return true;
  return containsPhrase(text, normalizeServiceText(label));
}
