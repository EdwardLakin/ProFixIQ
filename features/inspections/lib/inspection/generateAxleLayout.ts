//features/inspections/lib/inspection/generateAxleLayout.ts

import type { AxleInspection } from "./axleTypes";

export function generateAxleLayout(
  vehicleType: "car" | "truck" | "bus" | "trailer",
): AxleInspection[] {
  const hasAirBrakes = vehicleType !== "car";

  const baseAxle = (label: string): AxleInspection => ({
    axleLabel: label,
    brakeType: hasAirBrakes ? "air" : "hydraulic",
    left: {
      drumOrRotor: "",
      liningPadThickness: null,
      pushRodTravel: hasAirBrakes ? null : undefined,
      tirePressure: null,
      treadDepth: null,
    },
    right: {
      drumOrRotor: "",
      liningPadThickness: null,
      pushRodTravel: hasAirBrakes ? null : undefined,
      tirePressure: null,
      treadDepth: null,
    },
    wheelTorqueInner: null,
    wheelTorqueOuter: null,
    parkBrakeLining: hasAirBrakes ? null : undefined,
  });

  // Use "Steer 1" (not "Steer") so regex & labor counting catch it consistently.
  const configMap: Record<string, string[]> = {
    car: ["Front", "Rear"],
    truck: ["Steer 1", "Drive 1", "Drive 2"],
    bus: ["Steer 1", "Drive 1", "Drive 2"],
    trailer: ["Trailer 1", "Trailer 2", "Trailer 3"],
  };

  return configMap[vehicleType].map(baseAxle);
}
