// features/inspections/lib/masterInspectionList.ts

/* --------------------------------- Types --------------------------------- */

export type VehicleType = "car" | "truck" | "bus" | "trailer";
export type BrakeSystem = "hyd_brake" | "air_brake";

// new: let us tag things as light/medium/heavy duty
export type DutyClass = "light" | "medium" | "heavy";

export interface InspectionItem {
  item: string;
  unit?: string | null; // e.g. "mm" | "psi" | "kPa" | "in" | "ft·lb"
  vehicleTypes?: VehicleType[]; // which vehicle types this applies to
  systems?: string[]; // tags like "air_brake", "hyd_brake"
  dutyClasses?: DutyClass[]; // new: "light" | "medium" | "heavy"
  required?: boolean; // always include when matching
  priority?: number; // 1..100 (higher picked first)

  /**
   * Optional CVIP spec code – links an item to public.cvip_specs.code so
   * we can:
   * - enforce numeric thresholds (min/max)
   * - show “what is a fail” hints
   * - auto-reason about FAIL/RECOMMEND with measurements
   */
  specCode?: string | null;
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

/**
 * helper to make the default duty classes a bit less noisy:
 * - if it applies to a car → light
 * - if it applies to car + truck → light, medium, heavy
 * - if it applies only to truck/bus/trailer → heavy
 */
function inferredDutyFromVehicles(
  v?: VehicleType[],
): DutyClass[] | undefined {
  if (!v || v.length === 0) return undefined;

  const hasCar = v.includes("car");
  const hasTruck = v.includes("truck");
  const hasBus = v.includes("bus");
  const hasTrailer = v.includes("trailer");

  // car-only
  if (hasCar && !hasTruck && !hasBus && !hasTrailer) return ["light"];

  // car + anything else → make it universal
  if (hasCar && (hasTruck || hasBus || hasTrailer)) {
    return ["light", "medium", "heavy"];
  }

  // truck/bus/trailer only → heavy
  return ["heavy"];
}

/* -------------------------- Master inspection list ----------------------- */
/**
 * Base list + Alberta CVIP (truck/tractor, trailer/dolly, bus/motorcoach)
 * added in the closest matching sections.
 */
export const masterInspectionList: InspectionCategory[] = [
  /* ----------------------------- BRAKES ----------------------------- */
  {
    title: "Brakes — Hydraulic (Light / Medium / Trailer)",
    items: [
      // existing
      {
        item: "Front brake pads",
        unit: "mm",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        required: true,
        priority: 90,
        specCode: "brake_lining_front_disc",
      },
      {
        item: "Rear brake pads",
        unit: "mm",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
        specCode: "brake_lining_other",
      },
      {
        item: "Brake rotors (condition/thickness)",
        unit: "mm",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
        specCode: "brake_rotor",
      },
      {
        item: "Brake drums (if equipped)",
        unit: "mm",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
        specCode: "brake_drum",
      },
      {
        item: "Brake fluid level/condition",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        required: true,
        priority: 95,
      },
      {
        item: "Brake lines/hoses (leaks/chafe)",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "ABS wiring/sensors (hydraulic)",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Park brake operation",
        vehicleTypes: ["car", "truck", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Brake pedal travel",
        vehicleTypes: ["car", "truck", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 55,
      },
      {
        item: "Brake warning lights",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        required: true,
        priority: 90,
      },

      // CVIP hydraulic brake block — applies to car/light truck, plus trailers with hyd / surge
      {
        item: "Hydraulic system components",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 88,
      }, // 3H.1
      {
        item: "Vacuum-assisted (boost) system",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 75,
      }, // 3H.3
      {
        item: "Hydraulic assist (boost) system",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 75,
      }, // 3H.4
      {
        item: "Air assist (boost) system",
        systems: ["hyd_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 72,
      }, // 3H.5
      {
        item: "Air-over-hydraulic brake system",
        systems: ["hyd_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 72,
      }, // 3H.6 / trailer 3H.6
      {
        item: "Surge brake controller",
        systems: ["hyd_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // trailer 3H.7
      {
        item: "Vacuum system (trailer)",
        systems: ["hyd_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 68,
      }, // 3H.8
      {
        item: "Air-boosted trailer brake system",
        systems: ["hyd_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 68,
      }, // 3H.9
      {
        item: "Electric brake system",
        systems: ["hyd_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 75,
      }, // 3H.10
      {
        item: "Brake system indicator lamps",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      }, // 3H.11
      {
        item: "Drum brake system components (hydraulic)",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 78,
      }, // 3H.12
      {
        item: "Disc brake system components (hydraulic)",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 78,
      }, // 3H.13
      {
        item: "Mechanical parking brake",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      }, // 3H.14
      {
        item: "Spring-applied air-released parking brake",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // 3H.15
      {
        item: "Spring-applied hydraulic-released parking brake",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // 3H.16
      {
        item: "Anti-lock brake system (ABS) — hydraulic",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      }, // 3H.17
      {
        item: "Stability control system — hydraulic",
        systems: ["hyd_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 68,
      }, // 3H.18
      {
        item: "Brake performance (hydraulic)",
        systems: ["hyd_brake"],
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 90,
      }, // 3H.19
      {
        item: "Trailer breakaway battery condition",
        systems: ["hyd_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        required: false,
        priority: 70,
      },
    ],
  },
  {
    title: "Brakes — Air (Heavy Duty)",
    items: [
      // existing HD air items
      {
        item: "Brake shoes/linings",
        unit: "mm",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        required: true,
        priority: 95,
        specCode: "brake_lining_other",
      },
      {
        item: "Brake drums",
        unit: "mm",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 85,
        specCode: "brake_drum",
      },
      {
        item: "Push rod travel",
        unit: "in",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        required: true,
        priority: 95,
        // specCode for push-rod limits can be wired later per chamber size
      },
      {
        item: "Slack adjusters",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 85,
      },
      {
        item: "S-cams",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
        // specCode for S-cam bushings/play can be added when thresholds are finalized
      },
      {
        item: "Clevis pins and cotters",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Brake chambers (condition/mounts)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "Brake lines/hoses (leaks/chafe)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "ABS wiring/sensors (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Park brake (spring brake) function",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Brake warning lights",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        required: true,
        priority: 85,
      },

      // CVIP air system list — 3A.x from truck / bus / trailer
      {
        item: "Air compressor",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 90,
      }, // 3A.1
      {
        item: "Air supply system",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 88,
      }, // 3A.2
      {
        item: "Air system leakage",
        systems: ["air_brake"],
        vehicleTypes: ["trailer", "truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 85,
      }, // trailer 3A.3
      {
        item: "Air tank",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 85,
      }, // 3A.4
      {
        item: "Air tank check valves",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 3A.5
      {
        item: "Brake pedal / actuator (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.6
      {
        item: "Treadle valve and trailer hand valve",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.7
      {
        item: "Brake valves & controls (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 3A.8
      {
        item: "Proportioning / inversion / modulation valve",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.9
      {
        item: "Towing vehicle (tractor) protection system",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 75,
      }, // 3A.10
      {
        item: "Parking brake & emergency application (bus/trailer)",
        systems: ["air_brake"],
        vehicleTypes: ["bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.11 / trailer 3A.12
      {
        item: "Air system components",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 3A.13
      {
        item: "Brake chamber (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 3A.14
      {
        item: "Drum brake system components (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.15
      {
        item: "S-cam drum brake system (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.16
      {
        item: "Brake shoe travel (wedge brakes)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // 3A.17
      {
        item: "Disc brake system components (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // 3A.18
      {
        item: "Anti-lock brake system (ABS) — air",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 3A.19
      {
        item: "Anti-lock brake system (ABS) — trailer",
        systems: ["air_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // trailer 3A.20
      {
        item: "Stability control system (ESC/RSS) — air",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // 3A.21
      {
        item: "Stability control system (ESC/RSS) — trailer",
        systems: ["air_brake"],
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // trailer 3A.22
      {
        item: "Brake performance (air)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 90,
      }, // 3A.23
    ],
  },

  /* --------------------------- SUSPENSION --------------------------- */
  {
    title: "Suspension — Light Duty",
    items: [
      {
        item: "Front coil/leaf springs",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Rear coil/leaf springs",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Shocks/struts (leaks/bushings)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "Control arms (upper/lower)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Ball joints",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Sway bar bushings",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Sway bar links",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Torsion bars (if equipped)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 50,
      },
    ],
  },
  {
    title: "Suspension — Heavy Duty",
    items: [
      {
        item: "Suspension & frame attachments",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 92,
      }, // 2.1
      {
        item: "Axle attaching & tracking components",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 90,
      }, // 2.2
      {
        item: "Axle & axle assembly",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 85,
      }, // 2.3
      {
        item: "Spring & spring attachment",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 85,
      }, // 2.4
      {
        item: "Leaf springs (cracks/shackles/u-bolts)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 90,
      },
      {
        item: "Air suspension bags/lines (leaks/rub)",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 85,
      },
      {
        item: "Self-steer & controlled-steer axle (suspension)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 2.6
      {
        item: "Torque rods / radius rods (bushings)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "Equalizer bushings",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Axle beams/mounts",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Shock absorbers (leaks/bushings)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 75,
      }, // 2.7
    ],
  },

  /* ---------------------------- STEERING ---------------------------- */
  {
    title: "Steering — Light Duty",
    items: [
      {
        item: "Steering gear/rack (leaks/mounts)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "Pitman arm (if equipped)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Idler arm (if equipped)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Drag link (if equipped)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Tie rod ends (inner/outer)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "Steering shaft & u-joints",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Steering dampener (if equipped)",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 50,
      },
    ],
  },
  {
    title: "Steering — Heavy Duty",
    items: [
      {
        item: "Steering control & linkage",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 88,
      }, // 4.1
      {
        item: "Power steering system (hydraulic & electric)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 85,
      }, // 4.2
      {
        item: "Steering operation (active steer axle)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      }, // 4.3
      {
        item: "Steering gear box (leaks/mounts)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 85,
      },
      {
        item: "Kingpins (play/wear)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 90,
      },
      {
        item: "Kingpin radial play",
        unit: "mm",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 89,
        specCode: "kingpin_radial",
      },
      {
        item: "Kingpin axial play",
        unit: "mm",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 88,
        specCode: "kingpin_axial",
      },
      {
        item: "Drag link",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Tie rod ends",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 85,
      },
      {
        item: "Steering shaft & u-joints",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Steering dampener (if equipped)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Panhard/track rod (if equipped)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Self-steer & controlled-steer axle (steering)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
      }, // trailer 4.5
      {
        item: "Kingpin (converter dolly/trailer)",
        vehicleTypes: ["trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      }, // trailer 4.4
      {
        item: "Steering wheel free play at rim",
        unit: "mm",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 87,
        specCode: "steering_freeplay_max",
      },
    ],
  },

  /* ----------------------- AIR SUPPLY (HD ONLY) ---------------------- */
  {
    title: "Air System — Supply & Control (HD)",
    items: [
      {
        item: "Air compressor operation",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 85,
      },
      {
        item: "Air dryer/service status",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Governor cut-in / cut-out pressure",
        unit: "psi",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 90,
      },
      {
        item: "Tank drain valves",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Lines/fittings — leaks/rub points",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Pressure build time",
        systems: ["air_brake"],
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
    ],
  },

  /* -------------------------- TIRES & WHEELS ------------------------- */
  {
    title: "Tires & Wheels",
    items: [
      {
        item: "Sidewall damage/bulges",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "Valve stems/caps",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Wheel lug torque",
        unit: "ft·lb",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Rust trails/hub cracks",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 65,
      },
      {
        item: "Wheel bearings/play",
        unit: "mm",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
        specCode: "wheel_bearing_play_max",
      },

      // CVIP tires/wheels extras (9.1–9.11)
      {
        item: "Tire tread condition (uneven/cupping/chunking)",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Tire sidewall & manufacturer markings",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Wheel hub (condition/leaks)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Wheel/rim (all types)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Multi-piece wheel/rim",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Spoke wheel / demountable rim system",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Disc wheel system",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Wheel fasteners (nuts, bolts, studs)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
    ],
  },

  /* ------------------------- POWERTRAIN / BAY ------------------------ */
  {
    title: "Powertrain / Engine Bay",
    items: [
      // original
      {
        item: "Engine oil level/condition",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        required: true,
        priority: 95,
      },
      {
        item: "Coolant level/condition",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        required: true,
        priority: 90,
      },
      {
        item: "Transmission fluid (level/condition)",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Power steering fluid",
        vehicleTypes: ["car", "truck"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Belts (condition/tension)",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Hoses/clamps",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Radiator/fan shroud",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Oil leaks (engine/trans/axle)",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
        // leak classification specCode can be attached once finalized
      },
      {
        item: "Fuel leaks (lines/injectors)",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
        // leak classification specCode can be attached once finalized
      },
      {
        item: "Air filter condition",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Washer fluid",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 50,
      },

      // CVIP Section 1 add-ons (truck/bus)
      {
        item: "Accelerator pedal / throttle actuator",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 78,
      },
      {
        item: "Exhaust system (routing/leaks)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "Emission control systems and devices",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Drive shaft (guards / condition)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Clutch & clutch pedal",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Engine / transmission mount",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Engine shut down",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Engine start safety feature",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Gear position indicator",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Engine or accessory drive belt",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Hybrid / EV powertrain system",
        vehicleTypes: ["bus", "truck"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Gasoline or diesel fuel system",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Pressurized or liquefied fuel system (LPG / CNG / LNG)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Reefer or APU fuel system",
        vehicleTypes: ["truck", "trailer", "bus"],
        dutyClasses: ["heavy"],
        priority: 50,
      }, // bus 8.11
    ],
  },

  /* ----------------------------- DRIVELINE --------------------------- */
  {
    title: "Driveline",
    items: [
      {
        item: "Driveshaft / U-joints",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "Center support bearings",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Slip yokes/seals",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Axle seals/leaks",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 80,
      },
      {
        item: "Differential leaks/play",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Transmission mounts",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 55,
      },
    ],
  },

  /* ------------------------- CHASSIS / FRAME ------------------------- */
  {
    title: "Chassis / Frame / Body (HD CVIP)",
    items: [
      {
        item: "Frame rails/cracks",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
      },
      {
        item: "Crossmembers/rust",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Underbody coating",
        vehicleTypes: ["car", "truck", "bus", "trailer"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 40,
      },
      {
        item: "Body/cab mounts",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "PTO mounting/condition (if equipped)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "Mounted equipment/racks",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 50,
      },

      // CVIP section 8 items (bus/motorcoach)
      {
        item: "Hood or engine enclosure",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Cab & passenger-vehicle body",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Unitized body elements",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "Body, device or equipment attached/mounted to vehicle",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Bumper",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Windshield",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Windshield crack length (primary field of view)",
        unit: "mm",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 72,
        specCode: "windshield_crack_length_max",
      },
      {
        item: "Side windows",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Rear window",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Interior sun visor",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 45,
      },
      {
        item: "Exterior windshield sun visor",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 45,
      },
      {
        item: "Rear-view mirror",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Seat",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Seat belt / occupant restraint",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "Fender / mud flap",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Aerodynamic device & attachment",
        vehicleTypes: ["truck", "trailer", "bus"],
        dutyClasses: ["heavy"],
        priority: 45,
      },
      {
        item: "Floor pan / baggage floor / step well on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "Interior body & fixtures on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 45,
      },
      {
        item: "Service & exit door on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Emergency exit (door, window, roof hatch)",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Passenger compartment window on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "School bus exterior mirror (additional)",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Passenger seat on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "School bus body exterior",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Auxiliary compartment on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 45,
      },
    ],
  },

  /* ------------------------ EXHAUST / EMISSIONS ---------------------- */
  {
    title: "Exhaust / Emissions",
    items: [
      {
        item: "Exhaust leaks/soot marks",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 85,
        // leak classification specCode can be attached when finalized
      },
      {
        item: "DPF/DEF/SCR systems (visual)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Mounting brackets",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Heat shields",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 55,
      },
      {
        item: "Tailpipe condition",
        vehicleTypes: ["car", "truck", "bus"],
        dutyClasses: ["light", "medium", "heavy"],
        priority: 50,
      },
    ],
  },

  /* --------------------- FIFTH WHEEL / TRAILERING -------------------- */
  {
    title: "Fifth Wheel / Hitch / Couplers (HD)",
    items: [
      {
        item: "Fifth wheel locking jaws",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "Fifth wheel tilt & latch",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Slider locking mechanism",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Kingpin wear",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Fifth wheel vertical play at wheel",
        unit: "mm",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 78,
        specCode: "fifth_wheel_vertical_play_max",
      },
      {
        item: "Safety chains/hooks (if equipped)",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "Trailer plug",
        vehicleTypes: ["truck", "trailer"],
        dutyClasses: ["heavy"],
        priority: 60,
      },

      // CVIP Section 10 — couplers & hitches (bus + trailer forms)
      {
        item: "Hitch assembly, structure & attaching components",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Secondary attachment (safety chain or cable)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Pintle hook, pin hitch, or coupler hitch",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Ball type hitch",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 65,
      },
      {
        item: "Roll-coupling hitch",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Automated coupling device",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
    ],
  },

  /* ------------------- ELECTRICAL / LIGHTING / CAB ------------------- */
  {
    title: "Lighting & Reflectors",
    items: [
      {
        item: "Headlights (high/low)",
        required: true,
        priority: 95,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Turn signals/flashers",
        required: true,
        priority: 95,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Brake lights",
        required: true,
        priority: 95,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Tail/marker/clearance lights",
        priority: 85,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Reverse lights",
        priority: 70,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "License plate light",
        priority: 60,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Reflective tape/reflectors",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Work/auxiliary/emergency lights",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "Hazard switch function",
        priority: 80,
        dutyClasses: ["light", "medium", "heavy"],
      },

      // CVIP lighting section 6.x
      {
        item: "Instrument panel lamp",
        dutyClasses: ["light", "medium", "heavy"],
        priority: 60,
      },
      {
        item: "Headlamp aiming",
        dutyClasses: ["light", "medium", "heavy"],
        priority: 55,
      },
      {
        item: "Interior lamps on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "School bus additional lamps",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
    ],
  },
  {
    title: "Electrical System",
    items: [
      {
        item: "Battery terminals/hold-downs",
        priority: 85,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Battery voltage & load test",
        priority: 80,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Fuses/fuse block",
        priority: 60,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Wiring harness condition",
        priority: 70,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Alternator operation",
        priority: 80,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Starter operation",
        priority: 75,
        dutyClasses: ["light", "medium", "heavy"],
      },

      // CVIP electrical add-ons
      {
        item: "Trailer cord (output to towed vehicle)",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 65,
      }, // 7.3
      {
        item: "Alternator output on a school bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 65,
      }, // 7.4
    ],
  },
  {
    title: "Interior, HVAC & Wipers",
    items: [
      {
        item: "HVAC — heat/AC/defrost",
        priority: 85,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Windshield wipers & washers",
        priority: 90,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Horn operation",
        priority: 80,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Dash lights & gauges",
        priority: 70,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Seat belts & seats",
        required: true,
        priority: 90,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Mirrors (condition/adjustment)",
        priority: 80,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Door latches & hinges",
        priority: 60,
        dutyClasses: ["light", "medium", "heavy"],
      },
      {
        item: "Cab mounts",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },

      // CVIP 5.x bus / HD extras
      {
        item: "Fire extinguisher (HD/Bus/Trailer)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "Hazard warning kit",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 75,
      },
      {
        item: "Instruments & gauges on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Speedometer",
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Odometer",
        dutyClasses: ["light", "medium", "heavy"],
        priority: 70,
      },
      {
        item: "Heater & windshield defroster (bus)",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Fuel-burning auxiliary heater",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Auxiliary controls & devices",
        vehicleTypes: ["truck", "bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "On-board auxiliary equipment on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "First aid kit on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
      {
        item: "Accessibility features & equipment on a bus",
        vehicleTypes: ["bus"],
        dutyClasses: ["heavy"],
        priority: 55,
      },
    ],
  },

  /* -------------------------- SAFETY EQUIPMENT ----------------------- */
  {
    title: "Safety Equipment",
    items: [
      {
        item: "Fire extinguisher (charged/mounted)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 80,
      },
      {
        item: "First aid kit (complete)",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 60,
      },
      {
        item: "Emergency triangles/hazard kit",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 70,
      },
      {
        item: "Reflective vests",
        vehicleTypes: ["truck", "bus", "trailer"],
        dutyClasses: ["heavy"],
        priority: 50,
      },
      {
        item: "Spare fuses & bulbs",
        dutyClasses: ["light", "medium", "heavy"],
        priority: 40,
      },
    ],
  },
];

export default masterInspectionList;

/* --------------------------- Deterministic picker ------------------------- */

type BuildArgs = {
  vehicleType: VehicleType;
  brakeSystem: BrakeSystem;
  targetCount: number; // e.g., 60
  dutyClass?: DutyClass; // new, optional
};

/**
 * Deterministically pick items for the given vehicle profile.
 * - Always include `required` items that match.
 * - Prefer items whose `vehicleTypes` / `systems` / `dutyClasses` match.
 * - Then fill by highest `priority` until targetCount is reached.
 * Returns sections in the same shape your runtime expects.
 */
export function buildFromMaster({
  vehicleType,
  brakeSystem,
  targetCount,
  dutyClass,
}: BuildArgs) {
  // Flatten → filter → score
  type Flat = InspectionItem & { title: string; score: number };
  const flat: Flat[] = [];

  for (const cat of masterInspectionList) {
    for (const it of cat.items) {
      // vehicle filter
      if (
        it.vehicleTypes &&
        it.vehicleTypes.length &&
        !it.vehicleTypes.includes(vehicleType)
      )
        continue;

      // brake/other system filter (items with systems[] must match at least one)
      if (it.systems && it.systems.length && !it.systems.includes(brakeSystem))
        continue;

      // figure out duty for this item — prefer explicit, else infer from vehicles
      const itemDuty =
        it.dutyClasses && it.dutyClasses.length > 0
          ? it.dutyClasses
          : inferredDutyFromVehicles(it.vehicleTypes);

      // duty filter (new): if caller asked for "heavy" and the item has a duty set (explicit or inferred), respect it
      if (dutyClass && itemDuty && !itemDuty.includes(dutyClass)) continue;

      const matchVehicle = it.vehicleTypes?.includes(vehicleType) ? 1 : 0;
      const matchSystem = it.systems?.includes(brakeSystem) ? 1 : 0;
      const matchDuty =
        dutyClass && itemDuty && itemDuty.includes(dutyClass) ? 1 : 0;

      const base = it.priority ?? 50;
      const score =
        base +
        matchVehicle * 20 +
        matchSystem * 20 +
        matchDuty * 15 +
        (it.required ? 50 : 0);

      flat.push({ ...it, title: cat.title, score });
    }
  }

  // required first
  const required = flat
    .filter((f) => f.required)
    .sort((a, b) => b.score - a.score);

  // then the rest by score
  const rest = flat
    .filter((f) => !f.required)
    .sort((a, b) => b.score - a.score);

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
  const byTitle = new Map<
    string,
    {
      title: string;
      items: {
        item: string;
        unit?: string | null;
        specCode?: string | null;
      }[];
    }
  >();

  for (const it of picked) {
    if (!byTitle.has(it.title)) {
      byTitle.set(it.title, { title: it.title, items: [] });
    }
    byTitle.get(it.title)!.items.push({
      item: it.item,
      unit: it.unit ?? null,
      specCode: it.specCode ?? null,
    });
  }

  const sections = Array.from(byTitle.values()).map((s) => ({
    ...s,
    items: s.items.slice(0, 999),
  }));

  return sections;
}