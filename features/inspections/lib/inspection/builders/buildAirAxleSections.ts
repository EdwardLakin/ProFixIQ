import { generateAxleLayout } from "@inspections/lib/inspection/generateAxleLayout";
import type { InspectionItem, InspectionSection } from "@inspections/lib/inspection/types";

/**
 * Build a single section titled "Axles (Air)" populated with
 * all standard L/R measurement rows for each axle.
 *
 * Supports up to 5 axles (twin steer + tri drive) if you pass custom labels.
 */
export function buildAirAxleSection(opts: {
  vehicleType: "truck" | "bus" | "trailer";
  labels?: string[];              // e.g. ["Steer 1","Steer 2","Drive 1","Drive 2","Drive 3"]
  maxAxles?: number;              // hard cap (defaults to 5)
}): InspectionSection {
  const { vehicleType, labels, maxAxles = 5 } = opts;

  // If labels provided, use them; else fall back to generateAxleLayout’s defaults.
  let axleLabels: string[] = [];
  if (labels?.length) {
    axleLabels = labels.slice(0, maxAxles);
  } else {
    // generateAxleLayout gives you Steer, Drive 1, Drive 2, etc.
    const layout = generateAxleLayout(vehicleType);
    axleLabels = layout.map((a) => a.axleLabel).slice(0, maxAxles);
  }

  const items: InspectionItem[] = [];
  for (const label of axleLabels) {
    // Tire measurements
    items.push(
      { item: `${label} Left Tread Depth`,  unit: "mm", value: "" },
      { item: `${label} Right Tread Depth`, unit: "mm", value: "" },
      { item: `${label} Left Tire Pressure`,  unit: "psi", value: "" },
      { item: `${label} Right Tire Pressure`, unit: "psi", value: "" },
    );

    // Brake hardware + linings
    items.push(
      { item: `${label} Left Drum/Rotor`, value: "", unit: "" },
      { item: `${label} Right Drum/Rotor`, value: "", unit: "" },
      { item: `${label} Left Lining/Shoe`,  unit: "mm", value: "" },
      { item: `${label} Right Lining/Shoe`, unit: "mm", value: "" },
    );

    // Air-brake specifics
    items.push(
      { item: `${label} Left Push Rod Travel`,  unit: "in", value: "" },
      { item: `${label} Right Push Rod Travel`, unit: "in", value: "" },
    );

    // Wheel torque
    items.push(
      { item: `${label} Wheel Torque Inner`, unit: "ft·lb", value: "" },
      { item: `${label} Wheel Torque Outer`, unit: "ft·lb", value: "" },
    );
  }

  return { title: "Axles (Air)", items };
}