export type PropertyInspectionType =
  | "move_in"
  | "move_out"
  | "periodic"
  | "maintenance_follow_up";

export type PropertyInspectionTemplate = {
  type: PropertyInspectionType;
  label: string;
  description: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
};

const MOVE_SECTION_TITLES = [
  "Entry / doors / locks",
  "Walls / ceilings / floors",
  "Windows / blinds",
  "Kitchen",
  "Bathroom",
  "Bedrooms",
  "Laundry",
  "HVAC / heat",
  "Plumbing",
  "Electrical / lights / outlets",
  "Appliances",
  "Smoke / CO detectors",
  "Exterior / parking / access devices",
];

const templates: Record<PropertyInspectionType, PropertyInspectionTemplate> = {
  move_in: {
    type: "move_in",
    label: "Move-in inspection",
    description: "Document property condition before tenant occupancy.",
    sections: MOVE_SECTION_TITLES.map((title) => ({ title, items: ["Condition check"] })),
  },
  move_out: {
    type: "move_out",
    label: "Move-out inspection",
    description: "Document condition at end of occupancy for turnover planning.",
    sections: MOVE_SECTION_TITLES.map((title) => ({ title, items: ["Condition check"] })),
  },
  periodic: {
    type: "periodic",
    label: "Periodic inspection",
    description: "Routine internal property maintenance and safety review.",
    sections: [
      "Safety",
      "Leaks / moisture",
      "HVAC",
      "Plumbing",
      "Electrical",
      "Appliances",
      "Exterior",
      "Pest signs",
      "General condition",
      "Tenant-reported concerns",
    ].map((title) => ({ title, items: ["Inspection check"] })),
  },
  maintenance_follow_up: {
    type: "maintenance_follow_up",
    label: "Maintenance follow-up",
    description: "Verify completed work and confirm resolution quality.",
    sections: [
      "Work completed",
      "Area clean",
      "Issue resolved",
      "Photos attached",
      "Tenant satisfied",
      "Follow-up required",
    ].map((title) => ({ title, items: ["Follow-up check"] })),
  },
};

export function getPropertyInspectionTemplate(type: PropertyInspectionType): PropertyInspectionTemplate {
  return templates[type];
}

export const propertyInspectionTypes = Object.keys(templates) as PropertyInspectionType[];
