export const appFlow = [
  { key: "vehicle", title: "Vehicle" },
  { key: "concern", title: "Concern" },
  { key: "symptoms", title: "Symptoms" },
  { key: "duplication", title: "Duplication" },
  { key: "conditions", title: "Conditions" },
  { key: "context", title: "Context" },
  { key: "authorization", title: "Authorization" },
  { key: "review", title: "Review & Save" },
] as const;

export type AppStepKey = (typeof appFlow)[number]["key"];
