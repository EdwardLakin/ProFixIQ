import type {
  InspectionSection,
  InspectionItem,
} from "@inspections/lib/inspection/types";
import type { AxleInspection } from "@inspections/lib/inspection/axleTypes";

/** helper to make a typed UI item */
const make = (
  item: string,
  unit?: string | null,
  value?: string | number | null,
): InspectionItem => ({
  item,
  name: item,            // for legacy components that prefer `name`
  unit: unit ?? null,
  value: value ?? null,
  notes: "",
  status: undefined,
  photoUrls: [],
});

/** Convert AxleInspection[] (your data model) → UI sections/items */
export function axlesToSections(axles: AxleInspection[]): InspectionSection[] {
  return axles.map((axle) => {
    const { axleLabel, left, right, wheelTorqueInner, wheelTorqueOuter, parkBrakeLining } = axle;

    const items: InspectionItem[] = [
      // Tire pressure + tread depth (Left / Right)
      make("Left Tire Pressure", "psi", left.tirePressure),
      make("Left Tread Depth", "mm", left.treadDepth),
      make("Right Tire Pressure", "psi", right.tirePressure),
      make("Right Tread Depth", "mm", right.treadDepth),

      // Brake hardware condition + lining/pads thickness
      make("Left Drum/Rotor", null, left.drumOrRotor),
      make("Left Linings/Pads", "mm", left.liningPadThickness),
      make("Right Drum/Rotor", null, right.drumOrRotor),
      make("Right Linings/Pads", "mm", right.liningPadThickness),
    ];

    // Push-rod travel only when present (air brakes)
    if (typeof left.pushRodTravel !== "undefined") {
      items.push(make("Left Push Rod Travel", "in", left.pushRodTravel ?? null));
    }
    if (typeof right.pushRodTravel !== "undefined") {
      items.push(make("Right Push Rod Travel", "in", right.pushRodTravel ?? null));
    }

    // Park brake lining when present
    if (typeof parkBrakeLining !== "undefined") {
      items.push(make("Park Brake Lining", "mm", parkBrakeLining ?? null));
    }

    // Wheel torque checks
    items.push(make("Wheel Torque Inner", "ft·lb", wheelTorqueInner));
    items.push(make("Wheel Torque Outer", "ft·lb", wheelTorqueOuter));

    return { title: axleLabel, items };
  });
}