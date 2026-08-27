export const OWNER_PIN_PURPOSES = {
  PRIVILEGED: "owner_pin:privileged",
  SETTINGS: "owner_pin:settings",
  BILLING: "owner_pin:billing",
  BRANDING: "owner_pin:branding",
} as const;

export type OwnerPinPurpose =
  (typeof OWNER_PIN_PURPOSES)[keyof typeof OWNER_PIN_PURPOSES];
