// src/lib/inspection/masterServicesList.ts

import type { ServiceCategory } from "@shared/types/types/services";
export const masterServicesList: ServiceCategory[] = [
  {
    title: "Oil & Fluids Service",
    items: [
      { item: "Engine oil and filter change (gasoline)" },
      { item: "Engine oil and filter change (diesel)" },
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
    ],
  },
  {
    title: "Chassis & Driveline",
    items: [
      { item: "Grease chassis (light-duty)" },
      { item: "Grease chassis (heavy-duty)" },
      { item: "Grease 5th wheel" },
      { item: "Inspect driveline and U-joints" },
      { item: "Check hanger bearings" },
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
      { item: "Push rod travel check" },
    ],
  },
  {
    title: "Tire & Wheel Service",
    items: [
      { item: "Tire rotation (4-wheel)" },
      { item: "Tire rotation (dually)" },
      { item: "Tire inspection and pressure check" },
      { item: "Torque wheel lug nuts" },
      { item: "Inspect wheel bearings" },
    ],
  },
  {
    title: "Diagnostic Services",
    items: [
      { item: "Check engine light diagnosis" },
      { item: "ABS light diagnosis" },
      { item: "Airbag/SRS light diagnosis" },
      { item: "Battery/charging system test" },
      { item: "Cooling system pressure test" },
    ],
  },
  {
    title: "General Inspection Services",
    items: [
      { item: "Pre-purchase inspection" },
      { item: "CVIP inspection (commercial)" },
      { item: "Annual safety inspection" },
      { item: "Multi-point inspection (50-point)" },
    ],
  },
  {
    title: "HVAC & Interior Comfort",
    items: [
      { item: "HVAC system inspection" },
      { item: "Cabin air filter replacement" },
      { item: "Defrost system check" },
      { item: "Blower motor operation check" },
      { item: "Wiper blade replacement" },
      { item: "Washer fluid top-up" },
    ],
  },
  {
    title: "Emissions & DEF Systems",
    items: [
      { item: "DEF fluid top-up" },
      { item: "Check DEF warning lights" },
      { item: "Inspect SCR system (heavy-duty)" },
      { item: "EGR system inspection" },
      { item: "DPF cleaning or regeneration" },
    ],
  },
  {
    title: "Electrical System",
    items: [
      { item: "Battery test and replacement" },
      { item: "Charging system test" },
      { item: "Fuse check and replacement" },
      { item: "Lighting circuit diagnostics" },
    ],
  },
  {
    title: "Chassis Lubrication",
    items: [
      { item: "Grease chassis (automotive)" },
      { item: "Grease chassis (heavy-duty)" },
      { item: "Grease 5th wheel" },
      { item: "Grease PTO driveshaft" },
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
