// Compatibility-only feature matrix.
// Complete plans include all core platform features and this file must not be
// used for paid feature gating. Use usage/seat-limit primitives for scale limits.
export type FeatureAccess = {
  starter: boolean;
  pro: boolean;
  unlimited: boolean;
  addOnAvailable?: boolean;
};

export type FeatureKey =
  | "ai_diagnosis"
  | "inspection_flow"
  | "photo_to_quote"
  | "work_orders"
  | "chatbot"
  | "smart_scheduling"
  | "customer_portal"
  | "voice_input"
  | "parts_lookup"
  | "deferred_work_tracking";

export type Feature = {
  key: FeatureKey;
  title: string;
  description: string;
  access: FeatureAccess;
};

// Full feature config list retained for compatibility.
export const features: Feature[] = [
  {
    key: "ai_diagnosis",
    title: "AI Diagnosis",
    description:
      "Use image and text to identify mechanical problems automatically.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "inspection_flow",
    title: "Inspection Flow",
    description:
      "Voice-guided inspections, summary review, and quote generation.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "photo_to_quote",
    title: "Photo to Quote",
    description: "Take photos and let the AI generate repair quotes.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "work_orders",
    title: "Work Orders",
    description: "Create, track, and complete work orders in real time.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "chatbot",
    title: "AI Chatbot",
    description:
      "Talk to an AI mechanic assistant for help diagnosing and learning.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "smart_scheduling",
    title: "Smart Scheduling",
    description:
      "Optimize your shop’s schedule with AI-based job priority logic.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "customer_portal",
    title: "Customer Portal",
    description: "Let customers view quotes, photos, and approve work online.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "voice_input",
    title: "Voice Input",
    description:
      "Add repairs, inspections, and job notes hands-free using voice.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "parts_lookup",
    title: "Parts Lookup",
    description:
      "Search and price parts in real time through connected suppliers.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
  {
    key: "deferred_work_tracking",
    title: "Deferred Tracking",
    description: "Automatically track declined work for follow-up.",
    access: { starter: true, pro: true, unlimited: true, addOnAvailable: false },
  },
];

// Optional: key-to-feature lookup
export const featureMap = Object.fromEntries(
  features.map((f) => [f.key, f]),
) as { [k in FeatureKey]: Feature };
