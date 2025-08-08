export interface QuoteMenuItem {
  triggerPhrases: string[];
  parts: {
    name: string;
    sku?: string;
    supplier?: string;
    cost: number;
  }[];
  laborHours: number;
  category: "diagnose" | "repair" | "maintenance";
  notes?: string;
}

export const quoteMenu: QuoteMenuItem[] = [
  {
    triggerPhrases: [
      "front brakes worn",
      "brakes pads low",
      "brakes squealing",
      "brake pad thin",
      "brake pad fail",
      "brake pads 2mm",
    ],
    parts: [
      {
        name: "Front Brake Pads",
        sku: "FORD-BRKPAD5-F",
        supplier: "Ford OEM",
        cost: 85,
      },
    ],
    laborHours: 1.5,
    category: "repair",
    notes: "Typical replacement includes pads, rotor inspection.",
  },
  {
    triggerPhrases: [
      "check engine light",
      "CEL on",
      "engine light is on",
      "trouble code",
    ],
    parts: [],
    laborHours: 0.5,
    category: "diagnose",
    notes: "Initial scan and diagnosis of engine light causes.",
  },
  {
    triggerPhrases: ["oil change", "needs an oil change", "engine oil service"],
    parts: [
      {
        name: "5W-20 Synthetic Blend Oil",
        supplier: "Ford OEM",
        cost: 40,
      },
      {
        name: "Oil Filter",
        supplier: "Ford OEM",
        cost: 12,
      },
    ],
    laborHours: 0.3,
    category: "maintenance",
    notes: "Includes oil, filter, and disposal.",
  },
];
