// features/inspections/lib/masterInspectionList.ts

/* --------------------------------- Types --------------------------------- */

export type VehicleType = "car" | "truck" | "bus" | "trailer";
export type BrakeSystem = "hyd_brake" | "air_brake";

export interface InspectionItem {
  item: string;
  unit?: string | null;           // e.g. "mm" | "psi" | "kPa" | "in" | "ft·lb"
  vehicleTypes?: VehicleType[];   // which vehicle types this applies to
  systems?: string[];             // tags like "air_brake", "hyd_brake"
  required?: boolean;             // always include when matching
  priority?: number;              // 1..100 (higher picked first)
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

/* -------------------------- Master inspection list ----------------------- */
/**
 * De-duplicated and grouped so air/hydraulic specific items live in their own sections.
 * - “Brakes – Hydraulic (Light Duty)”
 * - “Brakes – Air (Heavy Duty)”
 * - “Steering – Light Duty”
 * - “Steering – Heavy Duty”
 * - “Suspension – Light Duty”
 * - “Suspension – Heavy Duty”
 * - Common systems remain single-source (Lighting, Electrical, Driveline, etc.)
 */
export const masterInspectionList: InspectionCategory[] = [
  /* ----------------------------- BRAKES ----------------------------- */
  {
    title: "Brakes — Hydraulic (Light Duty)",
    items: [
      { item: "Front brake pads", unit: "mm", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], required: true, priority: 90 },
      { item: "Rear brake pads", unit: "mm", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], priority: 85 },
      { item: "Brake rotors (condition/thickness)", unit: "mm", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], priority: 80 },
      { item: "Brake drums (if equipped)", unit: "mm", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Brake fluid level/condition", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], required: true, priority: 95 },
      { item: "Brake lines/hoses (leaks/chafe)", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], priority: 85 },
      { item: "ABS wiring/sensors (hydraulic)", systems: ["hyd_brake"], vehicleTypes: ["car","truck"], priority: 70 },
      { item: "Park brake operation", vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Brake pedal travel", vehicleTypes: ["car","truck"], priority: 55 },
      { item: "Brake warning lights", vehicleTypes: ["car","truck"], required: true, priority: 90 },
    ],
  },
  {
    title: "Brakes — Air (Heavy Duty)",
    items: [
      { item: "Brake shoes/linings", unit: "mm", systems: ["air_brake"], vehicleTypes: ["truck","bus"], required: true, priority: 95 },
      { item: "Brake drums", unit: "mm", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 85 },
      { item: "Push rod travel", unit: "in", systems: ["air_brake"], vehicleTypes: ["truck","bus"], required: true, priority: 95 },
      { item: "Slack adjusters", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 85 },
      { item: "S-cams", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 70 },
      { item: "Clevis pins and cotters", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 60 },
      { item: "Brake chambers (condition/mounts)", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 80 },
      { item: "Brake lines/hoses (leaks/chafe)", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 80 },
      { item: "ABS wiring/sensors (air)", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 70 },
      { item: "Park brake (spring brake) function", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 70 },
      { item: "Brake warning lights", vehicleTypes: ["truck","bus"], required: true, priority: 85 },
    ],
  },

  /* --------------------------- SUSPENSION --------------------------- */
  {
    title: "Suspension — Light Duty",
    items: [
      { item: "Front coil/leaf springs", vehicleTypes: ["car","truck"], priority: 80 },
      { item: "Rear coil/leaf springs", vehicleTypes: ["car","truck"], priority: 80 },
      { item: "Shocks/struts (leaks/bushings)", vehicleTypes: ["car","truck"], priority: 85 },
      { item: "Control arms (upper/lower)", vehicleTypes: ["car","truck"], priority: 70 },
      { item: "Ball joints", vehicleTypes: ["car","truck"], priority: 70 },
      { item: "Sway bar bushings", vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Sway bar links", vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Torsion bars (if equipped)", vehicleTypes: ["car","truck"], priority: 50 },
    ],
  },
  {
    title: "Suspension — Heavy Duty",
    items: [
      { item: "Leaf springs (cracks/shackles/u-bolts)", vehicleTypes: ["truck","bus","trailer"], priority: 90 },
      { item: "Air suspension bags/lines (leaks/rub)", systems: ["air_brake"], vehicleTypes: ["truck","bus","trailer"], priority: 85 },
      { item: "Torque rods / radius rods (bushings)", vehicleTypes: ["truck","bus","trailer"], priority: 80 },
      { item: "Equalizer bushings", vehicleTypes: ["truck","bus","trailer"], priority: 70 },
      { item: "Axle beams/mounts", vehicleTypes: ["truck","bus","trailer"], priority: 65 },
      { item: "Shock absorbers (leaks/bushings)", vehicleTypes: ["truck","bus","trailer"], priority: 75 },
    ],
  },

  /* ---------------------------- STEERING ---------------------------- */
  {
    title: "Steering — Light Duty",
    items: [
      { item: "Steering gear/rack (leaks/mounts)", vehicleTypes: ["car","truck"], priority: 85 },
      { item: "Pitman arm (if equipped)", vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Idler arm (if equipped)", vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Drag link (if equipped)", vehicleTypes: ["car","truck"], priority: 60 },
      { item: "Tie rod ends (inner/outer)", vehicleTypes: ["car","truck"], priority: 85 },
      { item: "Steering shaft & u-joints", vehicleTypes: ["car","truck"], priority: 70 },
      { item: "Steering dampener (if equipped)", vehicleTypes: ["car","truck"], priority: 50 },
    ],
  },
  {
    title: "Steering — Heavy Duty",
    items: [
      { item: "Steering gear box (leaks/mounts)", vehicleTypes: ["truck","bus"], priority: 85 },
      { item: "Kingpins (play/wear)", vehicleTypes: ["truck","bus"], priority: 90 },
      { item: "Drag link", vehicleTypes: ["truck","bus"], priority: 70 },
      { item: "Tie rod ends", vehicleTypes: ["truck","bus"], priority: 85 },
      { item: "Steering shaft & u-joints", vehicleTypes: ["truck","bus"], priority: 70 },
      { item: "Steering dampener (if equipped)", vehicleTypes: ["truck","bus"], priority: 55 },
      { item: "Panhard/track rod (if equipped)", vehicleTypes: ["truck","bus"], priority: 55 },
    ],
  },

  /* ----------------------- AIR SUPPLY (HD ONLY) ---------------------- */
  {
    title: "Air System — Supply & Control (HD)",
    items: [
      { item: "Air compressor operation", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 85 },
      { item: "Air dryer/service status", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 75 },
      { item: "Governor cut-in / cut-out pressure", unit: "psi", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 90 },
      { item: "Tank drain valves", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 70 },
      { item: "Lines/fittings — leaks/rub points", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 75 },
      { item: "Pressure build time", systems: ["air_brake"], vehicleTypes: ["truck","bus"], priority: 70 },
    ],
  },

  /* -------------------------- TIRES & WHEELS ------------------------- */
  {
    title: "Tires & Wheels",
    items: [
      { item: "Tread depth", unit: "mm", vehicleTypes: ["car","truck","bus","trailer"], required: true, priority: 95 },
      { item: "Sidewall damage/bulges", vehicleTypes: ["car","truck","bus","trailer"], priority: 85 },
      { item: "Valve stems/caps", vehicleTypes: ["car","truck","bus","trailer"], priority: 70 },
      { item: "Wheel lug torque", unit: "ft·lb", vehicleTypes: ["car","truck","bus","trailer"], priority: 80 },
      { item: "Rust trails/hub cracks", vehicleTypes: ["car","truck","bus","trailer"], priority: 65 },
      { item: "Wheel bearings/play", vehicleTypes: ["car","truck","bus","trailer"], priority: 70 },
    ],
  },

  /* ------------------------- POWERTRAIN / BAY ------------------------ */
  {
    title: "Powertrain / Engine Bay",
    items: [
      { item: "Engine oil level/condition", vehicleTypes: ["car","truck","bus"], required: true, priority: 95 },
      { item: "Coolant level/condition", vehicleTypes: ["car","truck","bus"], required: true, priority: 90 },
      { item: "Transmission fluid (level/condition)", vehicleTypes: ["car","truck","bus"], priority: 80 },
      { item: "Power steering fluid", vehicleTypes: ["car","truck"], priority: 70 },
      { item: "Belts (condition/tension)", vehicleTypes: ["car","truck","bus"], priority: 80 },
      { item: "Hoses/clamps", vehicleTypes: ["car","truck","bus"], priority: 80 },
      { item: "Radiator/fan shroud", vehicleTypes: ["car","truck","bus"], priority: 60 },
      { item: "Oil leaks (engine/trans/axle)", vehicleTypes: ["car","truck","bus"], priority: 85 },
      { item: "Fuel leaks (lines/injectors)", vehicleTypes: ["car","truck","bus"], priority: 80 },
      { item: "Air filter condition", vehicleTypes: ["car","truck","bus"], priority: 70 },
      { item: "Washer fluid", vehicleTypes: ["car","truck","bus"], priority: 50 },
    ],
  },

  /* ----------------------------- DRIVELINE --------------------------- */
  {
    title: "Driveline",
    items: [
      { item: "Driveshaft / U-joints", vehicleTypes: ["car","truck","bus"], priority: 85 },
      { item: "Center support bearings", vehicleTypes: ["car","truck","bus"], priority: 70 },
      { item: "Slip yokes/seals", vehicleTypes: ["car","truck","bus"], priority: 60 },
      { item: "Axle seals/leaks", vehicleTypes: ["car","truck","bus","trailer"], priority: 80 },
      { item: "Differential leaks/play", vehicleTypes: ["car","truck","bus"], priority: 70 },
      { item: "Transmission mounts", vehicleTypes: ["car","truck","bus"], priority: 55 },
    ],
  },

  /* ------------------------- CHASSIS / FRAME ------------------------- */
  {
    title: "Chassis / Frame",
    items: [
      { item: "Frame rails/cracks", vehicleTypes: ["car","truck","bus","trailer"], priority: 85 },
      { item: "Crossmembers/rust", vehicleTypes: ["car","truck","bus","trailer"], priority: 70 },
      { item: "Underbody coating", vehicleTypes: ["car","truck","bus","trailer"], priority: 40 },
      { item: "Body/cab mounts", vehicleTypes: ["car","truck","bus"], priority: 60 },
      { item: "PTO mounting/condition (if equipped)", vehicleTypes: ["truck","bus"], priority: 50 },
      { item: "Mounted equipment/racks", vehicleTypes: ["truck","bus","trailer"], priority: 50 },
    ],
  },

  /* ------------------------ EXHAUST / EMISSIONS ---------------------- */
  {
    title: "Exhaust / Emissions",
    items: [
      { item: "Exhaust leaks/soot marks", vehicleTypes: ["car","truck","bus"], priority: 85 },
      { item: "DPF/DEF/SCR systems (visual)", vehicleTypes: ["truck","bus"], priority: 75 },
      { item: "Mounting brackets", vehicleTypes: ["car","truck","bus"], priority: 60 },
      { item: "Heat shields", vehicleTypes: ["car","truck","bus"], priority: 55 },
      { item: "Tailpipe condition", vehicleTypes: ["car","truck","bus"], priority: 50 },
    ],
  },

  /* --------------------- FIFTH WHEEL / TRAILERING -------------------- */
  {
    title: "Fifth Wheel / Hitch (HD)",
    items: [
      { item: "Fifth wheel locking jaws", vehicleTypes: ["truck","trailer"], priority: 80 },
      { item: "Fifth wheel tilt & latch", vehicleTypes: ["truck","trailer"], priority: 70 },
      { item: "Slider locking mechanism", vehicleTypes: ["truck","trailer"], priority: 65 },
      { item: "Kingpin wear", vehicleTypes: ["truck","trailer"], priority: 70 },
      { item: "Safety chains/hooks (if equipped)", vehicleTypes: ["truck","trailer"], priority: 50 },
      { item: "Trailer plug", vehicleTypes: ["truck","trailer"], priority: 60 },
    ],
  },

  /* ------------------- ELECTRICAL / LIGHTING / CAB ------------------- */
  {
    title: "Lighting & Reflectors",
    items: [
      { item: "Headlights (high/low)", required: true, priority: 95 },
      { item: "Turn signals/flashers", required: true, priority: 95 },
      { item: "Brake lights", required: true, priority: 95 },
      { item: "Tail/marker/clearance lights", priority: 85 },
      { item: "Reverse lights", priority: 70 },
      { item: "License plate light", priority: 60 },
      { item: "Reflective tape/reflectors", vehicleTypes: ["truck","bus","trailer"], priority: 70 },
      { item: "Work/auxiliary/emergency lights", vehicleTypes: ["truck","bus","trailer"], priority: 50 },
      { item: "Hazard switch function", priority: 80 },
    ],
  },
  {
    title: "Electrical System",
    items: [
      { item: "Battery terminals/hold-downs", priority: 85 },
      { item: "Battery voltage & load test", priority: 80 },
      { item: "Fuses/fuse block", priority: 60 },
      { item: "Wiring harness condition", priority: 70 },
      { item: "Alternator operation", priority: 80 },
      { item: "Starter operation", priority: 75 },
    ],
  },
  {
    title: "Interior, HVAC & Wipers",
    items: [
      { item: "HVAC — heat/AC/defrost", priority: 85 },
      { item: "Windshield wipers & washers", priority: 90 },
      { item: "Horn operation", priority: 80 },
      { item: "Dash lights & gauges", priority: 70 },
      { item: "Seat belts & seats", required: true, priority: 90 },
      { item: "Mirrors (condition/adjustment)", priority: 80 },
      { item: "Door latches & hinges", priority: 60 },
      { item: "Cab mounts", vehicleTypes: ["truck","bus"], priority: 55 },
    ],
  },

  /* -------------------------- SAFETY EQUIPMENT ----------------------- */
  {
    title: "Safety Equipment",
    items: [
      { item: "Fire extinguisher (charged/mounted)", vehicleTypes: ["truck","bus","trailer"], priority: 80 },
      { item: "First aid kit (complete)", vehicleTypes: ["truck","bus","trailer"], priority: 60 },
      { item: "Emergency triangles/hazard kit", vehicleTypes: ["truck","bus","trailer"], priority: 70 },
      { item: "Reflective vests", vehicleTypes: ["truck","bus","trailer"], priority: 50 },
      { item: "Spare fuses & bulbs", priority: 40 },
    ],
  },
];

export default masterInspectionList;

/* --------------------------- Deterministic picker ------------------------- */

type BuildArgs = {
  vehicleType: VehicleType;
  brakeSystem: BrakeSystem;
  targetCount: number; // e.g., 60
};

/**
 * Deterministically pick items for the given vehicle profile.
 * - Always include `required` items that match.
 * - Prefer items whose `vehicleTypes` / `systems` match.
 * - Then fill by highest `priority` until targetCount is reached.
 * Returns sections in the same shape your runtime expects.
 */
export function buildFromMaster({ vehicleType, brakeSystem, targetCount }: BuildArgs) {
  // Flatten → filter → score
  type Flat = InspectionItem & { title: string; score: number };
  const flat: Flat[] = [];

  for (const cat of masterInspectionList) {
    for (const it of cat.items) {
      // vehicle filter
      if (it.vehicleTypes && it.vehicleTypes.length && !it.vehicleTypes.includes(vehicleType)) continue;
      // brake/other system filter (items with systems[] must match at least one)
      if (it.systems && it.systems.length && !it.systems.includes(brakeSystem)) continue;

      const matchVehicle = (it.vehicleTypes?.includes(vehicleType) ? 1 : 0);
      const matchSystem = (it.systems?.includes(brakeSystem) ? 1 : 0);
      const base = it.priority ?? 50;
      const score = base + matchVehicle * 20 + matchSystem * 20 + (it.required ? 50 : 0);

      flat.push({ ...it, title: cat.title, score });
    }
  }

  // required first
  const required = flat.filter(f => f.required).sort((a,b) => b.score - a.score);

  // then the rest by score
  const rest = flat.filter(f => !f.required).sort((a,b) => b.score - a.score);

  const picked: Flat[] = [];
  for (const f of required) {
    if (picked.length >= targetCount) break;
    picked.push(f);
  }
  for (const f of rest) {
    if (picked.length >= targetCount) break;
    picked.push(f);
  }

  // Group back into sections (preserve your category titles)
  const byTitle = new Map<string, { title: string; items: { item: string; unit?: string|null }[] }>();
  for (const it of picked) {
    if (!byTitle.has(it.title)) byTitle.set(it.title, { title: it.title, items: [] });
    byTitle.get(it.title)!.items.push({ item: it.item, unit: it.unit ?? null });
  }

  // Sort items inside each section by “importance”
  const sections = Array.from(byTitle.values()).map(s => ({
    ...s,
    items: s.items.slice(0, 999), // keep all (cap if you want)
  }));

  return sections;
}