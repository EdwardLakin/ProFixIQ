export interface InspectionItem {
  item: string;
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

export const masterInspectionList = [
  {
    title: "Brakes",
    items: [
      { item: "Front brake pads" },
      { item: "Rear brake pads" },
      { item: "Park brake operation" },
      { item: "Brake fluid level" },
      { item: "Brake shoes" },
      { item: "Brake drums" },
      { item: "Push rod travel" },
      { item: "Slack adjusters" },
      { item: "S-cams" },
      { item: "Clevis pins and cotters" },
      { item: "Brake lines and hoses" },
      { item: "ABS wiring/sensors" },
      { item: "Brake chamber condition" },
      { item: "Brake pedal travel" },
      { item: "Brake warning lights" },
    ],
  },
  {
    title: "Suspension",
    items: [
      { item: "Front coil springs / leaf springs" },
      { item: "Rear coil springs / leaf springs" },
      { item: "Shocks / struts" },
      { item: "Control arms (upper/lower)" },
      { item: "Ball joints" },
      { item: "Sway bar bushings" },
      { item: "Sway bar links" },
      { item: "Torsion bars" },
      { item: "Air suspension (bags/lines)" },
      { item: "Torque rods / radius rods" },
      { item: "Equalizer bushings" },
    ],
  },
  {
    title: "Steering",
    items: [
      { item: "Steering gear box" },
      { item: "Pitman arm" },
      { item: "Idler arm" },
      { item: "Drag link" },
      { item: "Tie rods (inner/outer)" },
      { item: "Steering shaft and u-joints" },
      { item: "Steering dampener" },
      { item: "Frame-to-axle track rod (Panhard rod)" },
      { item: "Axle-to-frame support links (radius rods)" },
    ],
  },
  {
    title: "Lighting & Reflectors",
    items: [
      { item: "Headlights (high/low beam)" },
      { item: "Turn signals / flashers" },
      { item: "Brake lights" },
      { item: "Tail lights" },
      { item: "Reverse lights" },
      { item: "License plate light" },
      { item: "Clearance / marker lights" },
      { item: "Reflective tape condition" },
      { item: "Reflectors / lens condition" },
      { item: "Work lights / auxiliary lights" },
      { item: "Emergency lights / strobes" },
      { item: "Hazard switch function" },
    ],
  },
  {
    title: "Safety Equipment",
    items: [
      { item: "Hazard triangle / warning kit" },
      { item: "Fire extinguisher" },
      { item: "First aid kit" },
      { item: "Safety vests / cones" },
    ],
  },
  {
    title: "HVAC / Defrost / Wipers",
    items: [
      { item: "Windshield wiper operation" },
      { item: "Washer fluid spray" },
      { item: "Defrost function" },
      { item: "Cabin air filter condition" },
      { item: "AC compressor operation" },
      { item: "Heater blower motor" },
    ],
  },
  {
    title: "Cab & Interior",
    items: [
      { item: "Driver seat & seat belt" },
      { item: "Horn operation" },
      { item: "Dash warning lights" },
      { item: "Switches & controls" },
      { item: "Cab mounts" },
      { item: "Mirror condition / adjustment" },
      { item: "Door latches & hinges" },
    ],
  },
  {
    title: "Electrical System",
    items: [
      { item: "Battery terminals / hold-downs" },
      { item: "Battery voltage and load test" },
      { item: "Fuses and fuse block" },
      { item: "Wiring harness condition" },
      { item: "Alternator operation" },
      { item: "Starter operation" },
    ],
  },
  {
    title: "Driveline",
    items: [
      { item: "Driveshaft / U-joints" },
      { item: "Center support bearings" },
      { item: "Slip yokes / seals" },
      { item: "Axle seals / leaks" },
      { item: "Differential leaks / play" },
      { item: "Transmission mounts" },
    ],
  },
  {
    title: "Powertrain / Engine Bay",
    items: [
      { item: "Engine oil level / condition" },
      { item: "Coolant level / condition" },
      { item: "Transmission fluid level / condition" },
      { item: "Power steering fluid" },
      { item: "Belt condition / tension" },
      { item: "Hoses / clamps" },
      { item: "Radiator / fan shroud" },
      { item: "Oil leaks (engine/trans/axle)" },
      { item: "Fuel leaks (lines/injectors)" },
      { item: "Air filter condition" },
    ],
  },
  {
    title: "Tires & Wheels",
    items: [
      { item: "Tread depth" },
      { item: "Sidewall damage / bulges" },
      { item: "Valve stems" },
      { item: "Wheel lugs torque" },
      { item: "Rust trails / hub cracks" },
      { item: "Wheel bearings / play" },
    ],
  },
  {
    title: "Chassis / Frame",
    items: [
      { item: "Frame rails / cracks" },
      { item: "Crossmembers / rust" },
      { item: "Underbody coating" },
      { item: "Body mounts" },
      { item: "PTO mounting & condition" },
      { item: "Mounted equipment / racks" },
    ],
  },
  {
    title: "Exhaust / Emissions",
    items: [
      { item: "Exhaust leaks / soot marks" },
      { item: "DPF / DEF systems" },
      { item: "Mounting brackets" },
      { item: "Heat shields" },
      { item: "Tailpipe condition" },
    ],
  },
  {
    title: "Air System (Heavy-Duty)",
    items: [
      { item: "Compressor operation" },
      { item: "Air dryer condition" },
      { item: "Governor function" },
      { item: "Tank drain valves" },
      { item: "Lines / fittings / leaks" },
      { item: "Cut-in / cut-out pressure" },
      { item: "Pressure build time" },
    ],
  },
  {
    title: "Fifth Wheel / Hitch",
    items: [
      { item: "Fifth wheel locking jaws" },
      { item: "Fifth wheel tilt & latch" },
      { item: "Slider locking mechanism" },
      { item: "Kingpin wear" },
      { item: "Safety chains / hooks" },
    ],
  },
  {
    title: "Safety Equipment",
    items: [
      { item: "Fire extinguisher (charged, mounted)" },
      { item: "First aid kit (complete)" },
      { item: "Emergency triangles / hazard kit" },
      { item: "Reflective vests" },
      { item: "Spare fuses & bulbs" },
    ],
  },
  {
    title: "Interior & Cab",
    items: [
      { item: "HVAC / defrost function" },
      { item: "Windshield wipers & washers" },
      { item: "Horn operation" },
      { item: "Dash lights & gauges" },
      { item: "Seat belts & seats" },
      { item: "Mirrors (condition & adjust)" },
    ],
  },
  {
    title: "Suspension (Extended)",
    items: [
      { item: "Control arms (upper & lower)" },
      { item: "Ball joints" },
      { item: "Struts / Shocks" },
      { item: "Sway bar bushings / links" },
      { item: "Leaf springs" },
      { item: "Torsion bars" },
      { item: "Axle beams (solid axle)" },
      { item: "Radius rods / trailing arms" },
    ],
  },
  {
    title: "Steering (Extended)",
    items: [
      { item: "Steering gear box" },
      { item: "Pitman arm" },
      { item: "Idler arm" },
      { item: "Drag link" },
      { item: "Steering dampener" },
      { item: "Steering shaft / u-joints" },
    ],
  },
  {
    title: "Brakes (Extended)",
    items: [
      { item: "Brake shoes (HD)" },
      { item: "Brake drums (HD)" },
      { item: "Slack adjusters" },
      { item: "S-cams" },
      { item: "Clevis pins" },
      { item: "Push rod travel" },
    ],
  },
];

export default masterInspectionList;
