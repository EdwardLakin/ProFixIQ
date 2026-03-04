export const fleetFlow = [
  { key: "vehicle", title: "Vehicle" },
  { key: "concern", title: "Concern" },
  { key: "symptoms", title: "Symptoms" },
  { key: "duplication", title: "Duplication" },
  { key: "authorization", title: "Authorization" },
  { key: "review", title: "Review & Submit" },
] as const;

export type FleetStepKey = (typeof fleetFlow)[number]["key"];
