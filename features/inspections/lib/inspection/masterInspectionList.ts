export interface InspectionItem {
  item: string;
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

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
      { item: "Front brake pads" },
      { item: "Rear brake pads" },
      { item: "Brake rotors (condition/thickness)" },
      { item: "Brake drums (if equipped)" },
      { item: "Brake fluid level/condition" },
      { item: "Brake lines/hoses (leaks/chafe)" },
      { item: "ABS wiring/sensors (hydraulic)" },
      { item: "Park brake operation" },
      { item: "Brake pedal travel" },
      { item: "Brake warning lights" },
    ],
  },
  {
    title: "Brakes — Air (Heavy Duty)",
    items: [
      { item: "Brake shoes/linings" },
      { item: "Brake drums" },
      { item: "Push rod travel" },
      { item: "Slack adjusters" },
      { item: "S-cams" },
      { item: "Clevis pins and cotters" },
      { item: "Brake chambers (condition/mounts)" },
      { item: "Brake lines/hoses (leaks/chafe)" },
      { item: "ABS wiring/sensors (air)" },
      { item: "Park brake (spring brake) function" },
      { item: "Brake warning lights" },
    ],
  },

  /* --------------------------- SUSPENSION --------------------------- */
  {
    title: "Suspension — Light Duty",
    items: [
      { item: "Front coil/leaf springs" },
      { item: "Rear coil/leaf springs" },
      { item: "Shocks/struts (leaks/bushings)" },
      { item: "Control arms (upper/lower)" },
      { item: "Ball joints" },
      { item: "Sway bar bushings" },
      { item: "Sway bar links" },
      { item: "Torsion bars (if equipped)" },
    ],
  },
  {
    title: "Suspension — Heavy Duty",
    items: [
      { item: "Leaf springs (cracks/shackles/u-bolts)" },
      { item: "Air suspension bags/lines (leaks/rub)" },
      { item: "Torque rods / radius rods (bushings)" },
      { item: "Equalizer bushings" },
      { item: "Axle beams/mounts" },
      { item: "Shock absorbers (leaks/bushings)" },
    ],
  },

  /* ---------------------------- STEERING ---------------------------- */
  {
    title: "Steering — Light Duty",
    items: [
      { item: "Steering gear/rack (leaks/mounts)" },
      { item: "Pitman arm (if equipped)" },
      { item: "Idler arm (if equipped)" },
      { item: "Drag link (if equipped)" },
      { item: "Tie rod ends (inner/outer)" },
      { item: "Steering shaft & u-joints" },
      { item: "Steering dampener (if equipped)" },
    ],
  },
  {
    title: "Steering — Heavy Duty",
    items: [
      { item: "Steering gear box (leaks/mounts)" },
      { item: "Kingpins (play/wear)" },
      { item: "Drag link" },
      { item: "Tie rod ends" },
      { item: "Steering shaft & u-joints" },
      { item: "Steering dampener (if equipped)" },
      { item: "Panhard/track rod (if equipped)" },
    ],
  },

  /* ----------------------- AIR SUPPLY (HD ONLY) ---------------------- */
  {
    title: "Air System — Supply & Control (HD)",
    items: [
      { item: "Air compressor operation" },
      { item: "Air dryer/service status" },
      { item: "Governor cut-in / cut-out pressure" },
      { item: "Tank drain valves" },
      { item: "Lines/fittings — leaks/rub points" },
      { item: "Pressure build time" },
    ],
  },

  /* -------------------------- TIRES & WHEELS ------------------------- */
  {
    title: "Tires & Wheels",
    items: [
      { item: "Tread depth" },
      { item: "Sidewall damage/bulges" },
      { item: "Valve stems/caps" },
      { item: "Wheel lug torque" },
      { item: "Rust trails/hub cracks" },
      { item: "Wheel bearings/play" },
    ],
  },

  /* ------------------------- POWERTRAIN / BAY ------------------------ */
  {
    title: "Powertrain / Engine Bay",
    items: [
      { item: "Engine oil level/condition" },
      { item: "Coolant level/condition" },
      { item: "Transmission fluid (level/condition)" },
      { item: "Power steering fluid" },
      { item: "Belts (condition/tension)" },
      { item: "Hoses/clamps" },
      { item: "Radiator/fan shroud" },
      { item: "Oil leaks (engine/trans/axle)" },
      { item: "Fuel leaks (lines/injectors)" },
      { item: "Air filter condition" },
      { item: "Washer fluid" },
    ],
  },

  /* ----------------------------- DRIVELINE --------------------------- */
  {
    title: "Driveline",
    items: [
      { item: "Driveshaft / U-joints" },
      { item: "Center support bearings" },
      { item: "Slip yokes/seals" },
      { item: "Axle seals/leaks" },
      { item: "Differential leaks/play" },
      { item: "Transmission mounts" },
    ],
  },

  /* ------------------------- CHASSIS / FRAME ------------------------- */
  {
    title: "Chassis / Frame",
    items: [
      { item: "Frame rails/cracks" },
      { item: "Crossmembers/rust" },
      { item: "Underbody coating" },
      { item: "Body/cab mounts" },
      { item: "PTO mounting/condition (if equipped)" },
      { item: "Mounted equipment/racks" },
    ],
  },

  /* ------------------------ EXHAUST / EMISSIONS ---------------------- */
  {
    title: "Exhaust / Emissions",
    items: [
      { item: "Exhaust leaks/soot marks" },
      { item: "DPF/DEF/SCR systems (visual)" },
      { item: "Mounting brackets" },
      { item: "Heat shields" },
      { item: "Tailpipe condition" },
    ],
  },

  /* --------------------- FIFTH WHEEL / TRAILERING -------------------- */
  {
    title: "Fifth Wheel / Hitch (HD)",
    items: [
      { item: "Fifth wheel locking jaws" },
      { item: "Fifth wheel tilt & latch" },
      { item: "Slider locking mechanism" },
      { item: "Kingpin wear" },
      { item: "Safety chains/hooks (if equipped)" },
      { item: "Trailer plug" },
    ],
  },

  /* ------------------- ELECTRICAL / LIGHTING / CAB ------------------- */
  {
    title: "Lighting & Reflectors",
    items: [
      { item: "Headlights (high/low)" },
      { item: "Turn signals/flashers" },
      { item: "Brake lights" },
      { item: "Tail/marker/clearance lights" },
      { item: "Reverse lights" },
      { item: "License plate light" },
      { item: "Reflective tape/reflectors" },
      { item: "Work/auxiliary/emergency lights" },
      { item: "Hazard switch function" },
    ],
  },
  {
    title: "Electrical System",
    items: [
      { item: "Battery terminals/hold-downs" },
      { item: "Battery voltage & load test" },
      { item: "Fuses/fuse block" },
      { item: "Wiring harness condition" },
      { item: "Alternator operation" },
      { item: "Starter operation" },
    ],
  },
  {
    title: "Interior, HVAC & Wipers",
    items: [
      { item: "HVAC — heat/AC/defrost" },
      { item: "Windshield wipers & washers" },
      { item: "Horn operation" },
      { item: "Dash lights & gauges" },
      { item: "Seat belts & seats" },
      { item: "Mirrors (condition/adjustment)" },
      { item: "Door latches & hinges" },
      { item: "Cab mounts" },
    ],
  },

  /* -------------------------- SAFETY EQUIPMENT ----------------------- */
  {
    title: "Safety Equipment",
    items: [
      { item: "Fire extinguisher (charged/mounted)" },
      { item: "First aid kit (complete)" },
      { item: "Emergency triangles/hazard kit" },
      { item: "Reflective vests" },
      { item: "Spare fuses & bulbs" },
    ],
  },
];

export default masterInspectionList;
