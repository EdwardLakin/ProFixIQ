// features/inspections/lib/inspection/builders/addAxleHelpers.ts
import type { InspectionItem } from "@inspections/lib/inspection/types";

/** AIR: full set for one axle label (e.g., "Steer 2", "Drive 3") */
export function buildAirAxleItems(axleLabel: string): InspectionItem[] {
  return [
    // Pressures
    { item: `${axleLabel} Left Tire Pressure`,  unit: "", value: "" },
    { item: `${axleLabel} Right Tire Pressure`, unit: "", value: "" },
    // Tread
    { item: `${axleLabel} Left Tread Depth`,  unit: "", value: "" },
    { item: `${axleLabel} Right Tread Depth`, unit: "", value: "" },
    // Lining / Shoe
    { item: `${axleLabel} Left Lining/Shoe Thickness`,  unit: "", value: "" },
    { item: `${axleLabel} Right Lining/Shoe Thickness`, unit: "", value: "" },
    // Drum / Rotor
    { item: `${axleLabel} Left Drum/Rotor Condition`,  unit: "", value: "" },
    { item: `${axleLabel} Right Drum/Rotor Condition`, unit: "", value: "" },
    // Push-rod (air specific)
    { item: `${axleLabel} Left Push Rod Travel`,  unit: "", value: "" },
    { item: `${axleLabel} Right Push Rod Travel`, unit: "", value: "" },
    // Wheel torque checks
    { item: `${axleLabel} Wheel Torque Inner`, unit: "", value: "" },
    { item: `${axleLabel} Wheel Torque Outer`, unit: "", value: "" },
  ];
}

/** HYDRAULIC/GENERIC: single axle set (no push-rod) */
export function buildHydraulicAxleItems(axleLabel: string): InspectionItem[] {
  return [
    { item: `${axleLabel} Left Tire Pressure`,  unit: "", value: "" },
    { item: `${axleLabel} Right Tire Pressure`, unit: "", value: "" },
    { item: `${axleLabel} Left Tread Depth`,  unit: "", value: "" },
    { item: `${axleLabel} Right Tread Depth`, unit: "", value: "" },
    { item: `${axleLabel} Left Pad Thickness`,  unit: "", value: "" },
    { item: `${axleLabel} Right Pad Thickness`, unit: "", value: "" },
    { item: `${axleLabel} Left Rotor Condition / Thickness`,  unit: "", value: "" },
    { item: `${axleLabel} Right Rotor Condition / Thickness`, unit: "", value: "" },
    { item: `${axleLabel} Wheel Torque`, unit: "", value: "" },
  ];
}