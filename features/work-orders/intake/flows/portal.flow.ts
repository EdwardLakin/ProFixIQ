export const portalFlow = [
  { key: "vehicle", title: "Vehicle" },
  { key: "concern", title: "Concern" },
  { key: "symptoms", title: "Symptoms" },
  { key: "duplication", title: "Duplication" },
  { key: "conditions", title: "Conditions (optional)" },
  { key: "authorization", title: "Authorization" },
  { key: "review", title: "Review & Submit" },
] as const;

export type PortalStepKey = (typeof portalFlow)[number]["key"];
