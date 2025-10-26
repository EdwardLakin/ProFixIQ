// services/masterServicesList.ts
export type ServiceCategory = {
  title: string;
  items: { item: string }[];
};

export const masterServicesList: ServiceCategory[] = [
  {
    title: "Oil & Fluids Service",
    items: [
      { item: "Engine oil and filter change (gasoline)" },
      { item: "Engine oil and filter change (diesel)" },
      { item: "Engine air filter replacement" },
      { item: "Cabin air filter replacement" },
      { item: "Transmission service (automatic)" },
      { item: "Transmission service (manual)" },
      { item: "Front differential service" },
      { item: "Rear differential service" },
      { item: "Transfer case service" },
      { item: "Power steering fluid service" },
      { item: "Coolant flush and fill" },
      { item: "Brake fluid flush" },
      { item: "DEF tank fill and system check" },
    ],
  },
  {
    title: "Fuel System",
    items: [
      { item: "Gasoline fuel filter replacement" },
      { item: "Diesel primary fuel filter replacement" },
      { item: "Diesel secondary fuel filter replacement" },
      { item: "Water separator drain/check" },
      { item: "Induction/throttle body service" },
      { item: "Fuel injector cleaning (as needed)" },
    ],
  },
  {
    title: "Chassis & Driveline",
    items: [
      { item: "Grease chassis (automotive)" },
      { item: "Grease chassis (heavy-duty)" },
      { item: "Grease 5th wheel" },
      { item: "Inspect driveline and U-joints" },
      { item: "Check hanger bearings" },
      { item: "Inspect CV axles and boots" },
    ],
  },
  {
    title: "Brake System Service",
    items: [
      { item: "Brake inspection (automotive)" },
      { item: "Brake inspection (heavy-duty)" },
      { item: "Replace front brake pads" },
      { item: "Replace rear brake pads" },
      { item: "Replace front brake shoes (heavy-duty)" },
      { item: "Replace rear brake shoes (heavy-duty)" },
      { item: "Brake rotor replacement" },
      { item: "Brake drum replacement" },
      { item: "Parking brake adjustment" },
      { item: "Push rod travel check (air brakes)" },
    ],
  },
  {
    title: "Tire, Wheel & Alignment",
    items: [
      { item: "Tire rotation (4-wheel)" },
      { item: "Tire rotation (dually)" },
      { item: "Tire inspection and pressure check" },
      { item: "Torque wheel lug nuts" },
      { item: "Wheel balance (as needed)" },
      { item: "Four-wheel alignment check" },
      { item: "TPMS inspection/reset" },
    ],
  },
  {
    title: "Diagnostic & Electrical",
    items: [
      { item: "Global scan + clear codes (report)" },
      { item: "Check engine light diagnosis" },
      { item: "ABS light diagnosis" },
      { item: "Airbag/SRS light diagnosis" },
      { item: "Battery/charging system test" },
      { item: "Starting/charging system diagnosis" },
      { item: "Software/TSB check (as applicable)" },
    ],
  },
  {
    title: "Cooling & Belts",
    items: [
      { item: "Cooling system pressure test" },
      { item: "Inspect hoses and clamps" },
      { item: "Serpentine belt inspection/replacement" },
      { item: "Timing belt replacement (as scheduled)" },
      { item: "Water pump inspection (leaks/noise)" },
    ],
  },
  {
    title: "General Inspection Services",
    items: [
      { item: "Pre-purchase inspection" },
      { item: "CVIP inspection (commercial)" },
      { item: "Annual safety inspection" },
      { item: "Multi-point inspection (50-point)" },
      { item: "Road test and report" },
    ],
  },
  {
    title: "HVAC & Interior",
    items: [
      { item: "HVAC system inspection" },
      { item: "Defrost system check" },
      { item: "Blower motor operation check" },
      { item: "Wiper blade replacement" },
      { item: "Washer fluid top-up" },
      { item: "Cabin air filter replacement" }, // duplicated on purpose – commonly suggested
    ],
  },
  {
    title: "Emissions & DEF (Diesel)",
    items: [
      { item: "DEF fluid top-up" },
      { item: "Check DEF warning lights" },
      { item: "Inspect SCR system (heavy-duty)" },
      { item: "EGR system inspection" },
      { item: "DPF cleaning or regeneration" },
      { item: "Glow plug system test (diesel)" },
      { item: "NOx sensor diagnosis (diesel)" },
    ],
  },
  {
    title: "Customer-Reported Issues",
    items: [
      { item: "Customer states: vehicle pulls to right" },
      { item: "Customer states: noise when braking" },
      { item: "Customer states: vibration at highway speed" },
      { item: "Customer states: fluid leak observed" },
      { item: "Customer states: warning light on dash" },
    ],
  },
];

export default masterServicesList;