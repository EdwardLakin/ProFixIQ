export type OffRoadEquipmentFamily =
  | "excavation"
  | "loading"
  | "dozing_grading"
  | "hauling"
  | "material_handling"
  | "aerial_access"
  | "compaction"
  | "road_construction"
  | "crushing_screening"
  | "drilling"
  | "trenching_utility"
  | "surface_mining"
  | "underground_mining"
  | "forestry"
  | "agriculture_industrial"
  | "oilfield_energy"
  | "snow_municipal"
  | "utility_site"
  | "stationary_towable"
  | "attachments";

export type OffRoadEquipmentProfile = {
  value: string;
  label: string;
  family: OffRoadEquipmentFamily;
};

export type OffRoadInspectionItem = {
  item: string;
  unit?: string | null;
  priority?: number;
  required?: boolean;
  catalogScope: "off_road";
  equipmentFamilies: OffRoadEquipmentFamily[];
};

export type OffRoadInspectionCategory = {
  title: string;
  items: OffRoadInspectionItem[];
};

const ALL_MOBILE: OffRoadEquipmentFamily[] = [
  "excavation",
  "loading",
  "dozing_grading",
  "hauling",
  "material_handling",
  "aerial_access",
  "compaction",
  "road_construction",
  "drilling",
  "trenching_utility",
  "surface_mining",
  "underground_mining",
  "forestry",
  "agriculture_industrial",
  "oilfield_energy",
  "snow_municipal",
  "utility_site",
];

const HYDRAULIC: OffRoadEquipmentFamily[] = [
  "excavation",
  "loading",
  "dozing_grading",
  "hauling",
  "material_handling",
  "aerial_access",
  "compaction",
  "road_construction",
  "crushing_screening",
  "drilling",
  "trenching_utility",
  "surface_mining",
  "underground_mining",
  "forestry",
  "agriculture_industrial",
  "oilfield_energy",
  "snow_municipal",
  "utility_site",
  "stationary_towable",
  "attachments",
];

const TRACKED: OffRoadEquipmentFamily[] = [
  "excavation",
  "loading",
  "dozing_grading",
  "drilling",
  "trenching_utility",
  "surface_mining",
  "underground_mining",
  "forestry",
  "utility_site",
];

export const offRoadEquipmentProfiles: OffRoadEquipmentProfile[] = [
  { value: "mini_excavator", label: "Mini excavator", family: "excavation" },
  { value: "crawler_excavator", label: "Crawler excavator", family: "excavation" },
  { value: "wheeled_excavator", label: "Wheeled excavator", family: "excavation" },
  { value: "hydraulic_mining_shovel", label: "Hydraulic mining shovel", family: "surface_mining" },
  { value: "electric_rope_shovel", label: "Electric rope shovel", family: "surface_mining" },
  { value: "dragline", label: "Dragline", family: "surface_mining" },
  { value: "wheel_loader", label: "Wheel loader", family: "loading" },
  { value: "compact_track_loader", label: "Compact track loader", family: "loading" },
  { value: "skid_steer", label: "Skid steer", family: "loading" },
  { value: "backhoe_loader", label: "Backhoe loader", family: "loading" },
  { value: "crawler_dozer", label: "Crawler dozer", family: "dozing_grading" },
  { value: "motor_grader", label: "Motor grader", family: "dozing_grading" },
  { value: "articulated_dump_truck", label: "Articulated dump truck", family: "hauling" },
  { value: "rigid_haul_truck", label: "Rigid / mining haul truck", family: "surface_mining" },
  { value: "underground_haul_truck", label: "Underground haul truck", family: "underground_mining" },
  { value: "forklift", label: "Forklift", family: "material_handling" },
  { value: "rough_terrain_forklift", label: "Rough-terrain forklift", family: "material_handling" },
  { value: "telehandler", label: "Telehandler", family: "material_handling" },
  { value: "reach_stacker", label: "Reach stacker / container handler", family: "material_handling" },
  { value: "scissor_lift", label: "Scissor lift", family: "aerial_access" },
  { value: "boom_lift", label: "Boom lift", family: "aerial_access" },
  { value: "vertical_mast_lift", label: "Vertical mast lift", family: "aerial_access" },
  { value: "roller_compactor", label: "Roller / compactor", family: "compaction" },
  { value: "asphalt_paver", label: "Asphalt paver", family: "road_construction" },
  { value: "cold_planer", label: "Cold planer / milling machine", family: "road_construction" },
  { value: "crusher", label: "Crusher", family: "crushing_screening" },
  { value: "screener", label: "Screener / trommel", family: "crushing_screening" },
  { value: "blasthole_drill", label: "Blasthole / track drill", family: "drilling" },
  { value: "trencher", label: "Trencher / rock saw", family: "trenching_utility" },
  { value: "underground_lhd", label: "Underground LHD / scoop", family: "underground_mining" },
  { value: "jumbo_drill", label: "Underground jumbo drill", family: "underground_mining" },
  { value: "roof_bolter", label: "Roof bolter", family: "underground_mining" },
  { value: "feller_buncher", label: "Feller buncher", family: "forestry" },
  { value: "harvester_forwarder", label: "Harvester / forwarder", family: "forestry" },
  { value: "tractor_ag", label: "Agricultural / industrial tractor", family: "agriculture_industrial" },
  { value: "combine", label: "Combine / harvester", family: "agriculture_industrial" },
  { value: "oilfield_unit", label: "Oilfield service equipment", family: "oilfield_energy" },
  { value: "snowcat", label: "Snowcat / tracked snow equipment", family: "snow_municipal" },
  { value: "utv_atv", label: "UTV / ATV / site vehicle", family: "utility_site" },
  { value: "generator", label: "Generator", family: "stationary_towable" },
  { value: "air_compressor", label: "Air compressor", family: "stationary_towable" },
  { value: "light_tower", label: "Light tower", family: "stationary_towable" },
  { value: "pump", label: "Pump / dewatering unit", family: "stationary_towable" },
  { value: "attachment", label: "Attachment / work tool", family: "attachments" },
];

function item(
  label: string,
  equipmentFamilies: OffRoadEquipmentFamily[],
  options: Pick<OffRoadInspectionItem, "unit" | "priority" | "required"> = {},
): OffRoadInspectionItem {
  return {
    item: label,
    catalogScope: "off_road",
    equipmentFamilies,
    ...options,
  };
}

export const offRoadInspectionCategories: OffRoadInspectionCategory[] = [
  {
    title: "Off-Road — Machine Identification & General Condition",
    items: [
      item("PIN / serial number", ALL_MOBILE, { required: true, priority: 100 }),
      item("Hour meter / operating hours", ALL_MOBILE, { unit: "hr", required: true, priority: 100 }),
      item("Active warning lights / fault codes", ALL_MOBILE, { required: true, priority: 95 }),
      item("Overall machine condition", ALL_MOBILE, { required: true, priority: 90 }),
      item("Fluid leaks observed", ALL_MOBILE, { required: true, priority: 95 }),
      item("Structural damage observed", ALL_MOBILE, { required: true, priority: 95 }),
      item("Unusual noise / vibration", ALL_MOBILE, { priority: 85 }),
      item("Installed attachments / machine configuration", [...ALL_MOBILE, "attachments"], { priority: 70 }),
    ],
  },
  {
    title: "Off-Road — Engine, Cooling & Fuel",
    items: [
      item("Engine oil level / condition", ALL_MOBILE, { required: true, priority: 95 }),
      item("Engine oil leaks", ALL_MOBILE, { priority: 90 }),
      item("Engine mounts", ALL_MOBILE, { priority: 70 }),
      item("Air filter restriction / intake system", ALL_MOBILE, { priority: 90 }),
      item("Turbocharger / charge-air piping", ALL_MOBILE, { priority: 75 }),
      item("Coolant level / condition", ALL_MOBILE, { required: true, priority: 95 }),
      item("Radiator / cooler pack condition", ALL_MOBILE, { required: true, priority: 90 }),
      item("Cooler pack cleanliness / debris", ALL_MOBILE, { priority: 90 }),
      item("Cooling fan / fan drive", ALL_MOBILE, { priority: 85 }),
      item("Belts / tensioners / pulleys", ALL_MOBILE, { priority: 80 }),
      item("Fuel tank / lines / hoses", ALL_MOBILE, { priority: 85 }),
      item("Fuel filters / water separator", ALL_MOBILE, { priority: 80 }),
    ],
  },
  {
    title: "Off-Road — Hydraulic System",
    items: [
      item("Hydraulic fluid level / condition", HYDRAULIC, { required: true, priority: 100 }),
      item("Hydraulic tank / breather", HYDRAULIC, { priority: 80 }),
      item("Hydraulic filters", HYDRAULIC, { priority: 80 }),
      item("Hydraulic pumps", HYDRAULIC, { priority: 90 }),
      item("Main / auxiliary control valves", HYDRAULIC, { priority: 85 }),
      item("Hydraulic hoses — leaks / chafe / abrasion", HYDRAULIC, { required: true, priority: 100 }),
      item("Hydraulic hard lines / fittings", HYDRAULIC, { priority: 90 }),
      item("Hydraulic cylinders — leaks / damage", HYDRAULIC, { required: true, priority: 95 }),
      item("Cylinder rods — scoring / pitting / bending", HYDRAULIC, { priority: 90 }),
      item("Cylinder pins / bushings", HYDRAULIC, { priority: 90 }),
      item("Hydraulic cooler", HYDRAULIC, { priority: 80 }),
      item("Quick couplers / auxiliary hydraulic connectors", HYDRAULIC, { priority: 80 }),
      item("Hydraulic noise / cavitation", HYDRAULIC, { priority: 80 }),
    ],
  },
  {
    title: "Off-Road — Electrical & Controls",
    items: [
      item("Batteries / hold-downs", ALL_MOBILE, { priority: 85 }),
      item("Battery cables / terminals / disconnect", ALL_MOBILE, { priority: 85 }),
      item("Starter / charging system", ALL_MOBILE, { priority: 80 }),
      item("Wiring harness routing / damage", ALL_MOBILE, { priority: 90 }),
      item("Connectors / grounds", ALL_MOBILE, { priority: 80 }),
      item("Work lights / beacon / strobe", ALL_MOBILE, { priority: 80 }),
      item("Instrument cluster / machine display", ALL_MOBILE, { priority: 85 }),
      item("Cameras / sensors / proximity systems", ALL_MOBILE, { priority: 75 }),
      item("Telematics / GPS / machine control", ALL_MOBILE, { priority: 60 }),
    ],
  },
  {
    title: "Off-Road — Drivetrain, Axles, Steering & Brakes",
    items: [
      item("Transmission / hydrostatic drive — level / condition / leaks", ["loading","dozing_grading","hauling","material_handling","surface_mining","underground_mining","forestry","agriculture_industrial","snow_municipal","utility_site"], { priority: 95 }),
      item("Driveshafts / U-joints / guards", ["loading","hauling","material_handling","surface_mining","agriculture_industrial","snow_municipal"], { priority: 85 }),
      item("Differentials / axle housings / final drives", ["loading","hauling","material_handling","surface_mining","underground_mining","agriculture_industrial"], { priority: 90 }),
      item("Steering cylinders / linkage / pins", ["loading","dozing_grading","hauling","material_handling","surface_mining","agriculture_industrial","snow_municipal"], { priority: 95 }),
      item("Articulation joint / center pins", ["loading","hauling","surface_mining","underground_mining","agriculture_industrial"], { priority: 95 }),
      item("Service brake operation", ALL_MOBILE, { required: true, priority: 100 }),
      item("Parking / emergency brake operation", ALL_MOBILE, { required: true, priority: 100 }),
      item("Brake accumulators / warning system", ["loading","hauling","surface_mining","underground_mining"], { priority: 90 }),
      item("Retarder / dynamic braking", ["hauling","surface_mining","underground_mining"], { priority: 85 }),
    ],
  },
  {
    title: "Off-Road — Undercarriage",
    items: [
      item("Track shoes / grouser wear", TRACKED, { unit: "%", priority: 95 }),
      item("Track shoe bolts", TRACKED, { priority: 90 }),
      item("Track links / rail wear", TRACKED, { unit: "%", priority: 95 }),
      item("Pins / bushings", TRACKED, { unit: "%", priority: 95 }),
      item("Track tension / sag", TRACKED, { priority: 95 }),
      item("Sprockets", TRACKED, { unit: "%", priority: 90 }),
      item("Front idlers", TRACKED, { unit: "%", priority: 90 }),
      item("Carrier rollers", TRACKED, { unit: "%", priority: 85 }),
      item("Track rollers", TRACKED, { unit: "%", priority: 90 }),
      item("Track frame / guards", TRACKED, { priority: 85 }),
      item("Track adjuster / recoil system", TRACKED, { priority: 90 }),
      item("Final drive / travel motor leaks", TRACKED, { priority: 95 }),
    ],
  },
  {
    title: "Off-Road — Tires, Wheels & Rims",
    items: [
      item("Tire condition — cuts / chunking / separation", ["loading","hauling","material_handling","aerial_access","compaction","road_construction","surface_mining","agriculture_industrial","oilfield_energy","snow_municipal","utility_site"], { required: true, priority: 95 }),
      item("Tire pressure", ["loading","hauling","material_handling","aerial_access","compaction","road_construction","surface_mining","agriculture_industrial","oilfield_energy","snow_municipal","utility_site"], { unit: "psi", priority: 90 }),
      item("Tread depth / remaining rubber", ["loading","hauling","material_handling","aerial_access","compaction","road_construction","agriculture_industrial","oilfield_energy","snow_municipal","utility_site"], { unit: "mm", priority: 80 }),
      item("Wheel / rim condition", ["loading","hauling","material_handling","aerial_access","compaction","road_construction","surface_mining","agriculture_industrial","oilfield_energy","snow_municipal","utility_site"], { priority: 95 }),
      item("Multi-piece rim / lock ring condition", ["loading","hauling","surface_mining"], { priority: 100 }),
      item("Wheel fasteners / studs", ["loading","hauling","material_handling","aerial_access","compaction","road_construction","surface_mining","agriculture_industrial","oilfield_energy","snow_municipal","utility_site"], { priority: 95 }),
    ],
  },
  {
    title: "Off-Road — Structure, Chassis, Pins & Bushings",
    items: [
      item("Main frame / subframe", ALL_MOBILE, { required: true, priority: 100 }),
      item("Cracks / failed welds / previous repairs", ALL_MOBILE, { required: true, priority: 100 }),
      item("Counterweight / mounting", ["excavation","loading","surface_mining"], { priority: 85 }),
      item("Belly pans / guards", ALL_MOBILE, { priority: 80 }),
      item("Steps / handrails / ladders / walkways", ALL_MOBILE, { required: true, priority: 90 }),
      item("Pin / bushing condition and play", HYDRAULIC, { priority: 100 }),
      item("Pin retainers / locking bolts", HYDRAULIC, { priority: 90 }),
      item("Grease fittings / grease passages", HYDRAULIC, { priority: 90 }),
    ],
  },
  {
    title: "Off-Road — Excavator & Shovel",
    items: [
      item("Boom structure / boom foot", ["excavation","surface_mining"], { priority: 100 }),
      item("Stick / dipper structure", ["excavation","surface_mining"], { priority: 100 }),
      item("Boom / stick / bucket cylinders", ["excavation","surface_mining"], { priority: 95 }),
      item("Bucket linkage / H-link / pins", ["excavation","surface_mining"], { priority: 95 }),
      item("Bucket / cutting edge / teeth / retainers", ["excavation","surface_mining"], { priority: 95 }),
      item("Quick coupler / locking mechanism", ["excavation"], { priority: 100 }),
      item("Swing bearing / swing play", ["excavation","surface_mining"], { priority: 100 }),
      item("Swing motor / gearbox / brake", ["excavation","surface_mining"], { priority: 90 }),
      item("Rotary manifold / swivel", ["excavation"], { priority: 90 }),
    ],
  },
  {
    title: "Off-Road — Loader, Dozer & Grader Work Equipment",
    items: [
      item("Loader arms / lift frame", ["loading"], { priority: 100 }),
      item("Lift / tilt cylinders", ["loading"], { priority: 95 }),
      item("Loader linkage / bellcrank / Z-bar", ["loading"], { priority: 95 }),
      item("Bucket / cutting edge / teeth", ["loading"], { priority: 95 }),
      item("Blade / cutting edges / end bits", ["dozing_grading"], { priority: 100 }),
      item("Push arms / C-frame / trunnions", ["dozing_grading"], { priority: 95 }),
      item("Equalizer bar", ["dozing_grading"], { priority: 95 }),
      item("Ripper / shanks / teeth / cylinders", ["dozing_grading"], { priority: 90 }),
      item("Moldboard / circle / circle drive", ["dozing_grading"], { priority: 100 }),
      item("Drawbar / saddle / side shift", ["dozing_grading"], { priority: 90 }),
    ],
  },
  {
    title: "Off-Road — Forklift & Telehandler",
    items: [
      item("Mast channels / rollers", ["material_handling"], { required: true, priority: 100 }),
      item("Lift chains / anchors / chain tension", ["material_handling"], { required: true, priority: 100 }),
      item("Lift / tilt cylinders", ["material_handling"], { priority: 95 }),
      item("Carriage / carriage rollers", ["material_handling"], { priority: 95 }),
      item("Forks — heel / blade / tip wear", ["material_handling"], { required: true, priority: 100 }),
      item("Fork locking pins / retainers", ["material_handling"], { required: true, priority: 95 }),
      item("Load backrest / overhead guard", ["material_handling"], { required: true, priority: 95 }),
      item("Sideshift / fork positioner / attachment", ["material_handling"], { priority: 85 }),
      item("Boom sections / wear pads / rollers", ["material_handling"], { priority: 95 }),
      item("Stabilizers / outriggers / frame levelling", ["material_handling"], { priority: 90 }),
      item("Load moment indicator / overload protection", ["material_handling"], { required: true, priority: 100 }),
      item("Capacity / data plate", ["material_handling"], { required: true, priority: 100 }),
    ],
  },
  {
    title: "Off-Road — MEWP / Man Lift Safety",
    items: [
      item("Platform / gate / guardrails", ["aerial_access"], { required: true, priority: 100 }),
      item("Platform controls / ground controls", ["aerial_access"], { required: true, priority: 100 }),
      item("Emergency stop / emergency lowering", ["aerial_access"], { required: true, priority: 100 }),
      item("Function enable / foot switch", ["aerial_access"], { priority: 95 }),
      item("Boom sections / scissor arms / pins / rollers", ["aerial_access"], { required: true, priority: 100 }),
      item("Lift cylinders / rotation bearing / jib", ["aerial_access"], { priority: 95 }),
      item("Outriggers / pothole protection", ["aerial_access"], { required: true, priority: 100 }),
      item("Tilt sensor / load sensor / overload system", ["aerial_access"], { required: true, priority: 100 }),
      item("Drive / elevation interlocks", ["aerial_access"], { required: true, priority: 100 }),
      item("Fall-protection anchor / decals / load rating", ["aerial_access"], { required: true, priority: 100 }),
    ],
  },
  {
    title: "Off-Road — Mining Haul & Underground",
    items: [
      item("Dump body / liners / mounts", ["hauling","surface_mining","underground_mining"], { priority: 95 }),
      item("Hoist cylinders / pins / hydraulic system", ["hauling","surface_mining","underground_mining"], { priority: 100 }),
      item("Body-up switch / position sensor / restraint", ["hauling","surface_mining"], { priority: 95 }),
      item("Rock ejectors / mud guards", ["surface_mining"], { priority: 80 }),
      item("Suspension struts — charge / leaks", ["surface_mining"], { priority: 95 }),
      item("Electric wheel / traction motors", ["surface_mining"], { priority: 90 }),
      item("Grid / blower / dynamic retarding system", ["surface_mining"], { priority: 90 }),
      item("Payload monitoring system", ["surface_mining"], { priority: 75 }),
      item("LHD bucket / linkage / boom", ["underground_mining"], { priority: 95 }),
      item("Emergency egress / access stairs / ladders", ["surface_mining","underground_mining"], { required: true, priority: 100 }),
    ],
  },
  {
    title: "Off-Road — Crusher, Screener & Conveyor",
    items: [
      item("Crusher chamber / wear components", ["crushing_screening"], { required: true, priority: 100 }),
      item("Jaw dies / mantle / concaves / blow bars", ["crushing_screening"], { priority: 95 }),
      item("Rotor / bearings", ["crushing_screening"], { priority: 95 }),
      item("Feeder / grizzly", ["crushing_screening"], { priority: 90 }),
      item("Screen deck / screen media / exciter", ["crushing_screening"], { priority: 95 }),
      item("Conveyor belt condition / tracking / tension", ["crushing_screening"], { required: true, priority: 100 }),
      item("Idlers / head pulley / tail pulley / scrapers", ["crushing_screening"], { priority: 90 }),
      item("Guards / emergency stops / pull cords", ["crushing_screening"], { required: true, priority: 100 }),
      item("Dust suppression / magnet system", ["crushing_screening"], { priority: 80 }),
    ],
  },
  {
    title: "Off-Road — Drill, Trencher & Utility Equipment",
    items: [
      item("Mast / feed rails / mast pins", ["drilling"], { required: true, priority: 100 }),
      item("Feed chains / rotary head / drill motor", ["drilling"], { priority: 95 }),
      item("Drill rod handling / carousel / clamps", ["drilling"], { priority: 95 }),
      item("Compressor / dust collector / suppression", ["drilling"], { priority: 90 }),
      item("Leveling jacks / drill deck / guards", ["drilling"], { required: true, priority: 95 }),
      item("Trencher boom / digging chain / teeth", ["trenching_utility"], { required: true, priority: 100 }),
      item("Rock saw / cutting wheel", ["trenching_utility"], { priority: 95 }),
      item("Boom lift / side shift / crumber", ["trenching_utility"], { priority: 85 }),
    ],
  },
  {
    title: "Off-Road — Forestry",
    items: [
      item("Boom / stick / rotator", ["forestry"], { priority: 100 }),
      item("Grapple / harvester head", ["forestry"], { priority: 100 }),
      item("Feed rollers / delimbing knives", ["forestry"], { priority: 95 }),
      item("Saw motor / bar / chain / chain catcher", ["forestry"], { required: true, priority: 100 }),
      item("Measuring wheel / head sensors", ["forestry"], { priority: 85 }),
      item("Head hoses / hose guards", ["forestry"], { priority: 95 }),
      item("Cab guarding / FOPS / ROPS", ["forestry"], { required: true, priority: 100 }),
    ],
  },
  {
    title: "Off-Road — Operator Station & Safety",
    items: [
      item("Seat / suspension / seat belt", ALL_MOBILE, { required: true, priority: 100 }),
      item("ROPS / FOPS / cab structure", ALL_MOBILE, { required: true, priority: 100 }),
      item("Doors / windows / windshield / wipers", ALL_MOBILE, { priority: 85 }),
      item("Mirrors / cameras / visibility aids", ALL_MOBILE, { priority: 90 }),
      item("Controls / joysticks / pedals", ALL_MOBILE, { required: true, priority: 95 }),
      item("Horn / backup alarm / travel alarm", ALL_MOBILE, { required: true, priority: 100 }),
      item("Emergency exits", ["hauling","material_handling","aerial_access","surface_mining","underground_mining","forestry"], { required: true, priority: 95 }),
      item("Fire extinguisher", ALL_MOBILE, { required: true, priority: 95 }),
      item("Safety decals / load charts", ALL_MOBILE, { priority: 90 }),
    ],
  },
  {
    title: "Off-Road — Fire Suppression & Lubrication",
    items: [
      item("Automatic fire suppression bottles / pressure", ["surface_mining","underground_mining","forestry","oilfield_energy"], { required: true, priority: 100 }),
      item("Suppression lines / nozzles / detection cable", ["surface_mining","underground_mining","forestry","oilfield_energy"], { priority: 100 }),
      item("Manual activation / control module", ["surface_mining","underground_mining","forestry","oilfield_energy"], { priority: 95 }),
      item("Engine / fuel shutdown interface", ["surface_mining","underground_mining","forestry","oilfield_energy"], { priority: 95 }),
      item("Automatic greaser reservoir / pump", HYDRAULIC, { priority: 90 }),
      item("Grease distribution blocks / lines / injectors", HYDRAULIC, { priority: 90 }),
      item("Manual grease points / evidence of lubrication", HYDRAULIC, { priority: 95 }),
      item("Blocked grease passage / seized grease fitting", HYDRAULIC, { priority: 90 }),
    ],
  },
  {
    title: "Off-Road — Stationary / Towable Equipment",
    items: [
      item("Engine / power unit condition", ["stationary_towable"], { required: true, priority: 95 }),
      item("Fuel / oil / coolant leaks", ["stationary_towable"], { required: true, priority: 100 }),
      item("Generator output / voltage / frequency", ["stationary_towable"], { priority: 95 }),
      item("Compressor pressure / separator / hoses", ["stationary_towable"], { priority: 95 }),
      item("Pump suction / discharge / seals", ["stationary_towable"], { priority: 95 }),
      item("Trailer frame / hitch / safety chains", ["stationary_towable"], { required: true, priority: 100 }),
      item("Tires / wheels / lights", ["stationary_towable"], { priority: 90 }),
      item("Guards / emergency stop / shutdowns", ["stationary_towable"], { required: true, priority: 100 }),
    ],
  },
  {
    title: "Off-Road — Attachments / Work Tools",
    items: [
      item("Attachment structure / welds", ["attachments"], { required: true, priority: 100 }),
      item("Pins / bushings / retainers", ["attachments"], { priority: 95 }),
      item("Cutting edge / teeth / wear plates", ["attachments"], { priority: 95 }),
      item("Hydraulic hoses / fittings / couplers", ["attachments"], { priority: 100 }),
      item("Attachment cylinders / motors", ["attachments"], { priority: 95 }),
      item("Quick-coupler interface / lock", ["attachments"], { required: true, priority: 100 }),
      item("Guards / shields / decals", ["attachments"], { priority: 90 }),
    ],
  },
];

export function offRoadCategoriesForFamily(
  family: OffRoadEquipmentFamily,
): OffRoadInspectionCategory[] {
  return offRoadInspectionCategories
    .map((section) => ({
      ...section,
      items: section.items.filter((entry) =>
        entry.equipmentFamilies.includes(family),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function offRoadProfileByValue(
  value: string | null | undefined,
): OffRoadEquipmentProfile | null {
  if (!value) return null;
  return offRoadEquipmentProfiles.find((profile) => profile.value === value) ?? null;
}


export function buildOffRoadFromMaster({
  profileValue,
  targetCount,
}: {
  profileValue: string;
  targetCount: number;
}): OffRoadInspectionCategory[] {
  const profile = offRoadProfileByValue(profileValue);
  if (!profile) return [];

  const sections = offRoadCategoriesForFamily(profile.family);
  const ranked = sections
    .flatMap((section, sectionIndex) =>
      section.items.map((entry, itemIndex) => ({
        sectionTitle: section.title,
        sectionIndex,
        itemIndex,
        entry,
      })),
    )
    .sort((a, b) => {
      const requiredDelta = Number(Boolean(b.entry.required)) - Number(Boolean(a.entry.required));
      if (requiredDelta !== 0) return requiredDelta;
      const priorityDelta = (b.entry.priority ?? 0) - (a.entry.priority ?? 0);
      if (priorityDelta !== 0) return priorityDelta;
      if (a.sectionIndex !== b.sectionIndex) return a.sectionIndex - b.sectionIndex;
      return a.itemIndex - b.itemIndex;
    });

  const requiredCount = ranked.filter((row) => row.entry.required).length;
  const take = Math.max(requiredCount, Math.max(1, targetCount));
  const selected = new Set(ranked.slice(0, take).map((row) => `${row.sectionTitle}\u0000${row.entry.item}`));

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((entry) =>
        selected.has(`${section.title}\u0000${entry.item}`),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
