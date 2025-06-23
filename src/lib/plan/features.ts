// Types for access control by plan
export type FeatureAccess = {
  diy: boolean;
  pro: boolean;
  proPlus: boolean;
  addOnAvailable?: boolean;
};

export type FeatureKey =
  | 'ai_diagnosis'
  | 'inspection_flow'
  | 'photo_to_quote'
  | 'work_orders'
  | 'chatbot'
  | 'smart_scheduling'
  | 'customer_portal'
  | 'voice_input'
  | 'parts_lookup'
  | 'deferred_work_tracking';

export type Feature = {
  key: FeatureKey;
  title: string;
  description: string;
  access: FeatureAccess;
};

// Full feature config list
export const features: Feature[] = [
  {
    key: 'ai_diagnosis',
    title: 'AI Diagnosis',
    description: 'Use image and text to identify mechanical problems automatically.',
    access: { diy: false, pro: true, proPlus: true, addOnAvailable: true },
  },
  {
    key: 'inspection_flow',
    title: 'Inspection Flow',
    description: 'Voice-guided inspections, summary review, and quote generation.',
    access: { diy: false, pro: true, proPlus: true, addOnAvailable: true },
  },
  {
    key: 'photo_to_quote',
    title: 'Photo to Quote',
    description: 'Take photos and let the AI generate repair quotes.',
    access: { diy: false, pro: true, proPlus: true, addOnAvailable: true },
  },
  {
    key: 'work_orders',
    title: 'Work Orders',
    description: 'Create, track, and complete work orders in real time.',
    access: { diy: false, pro: true, proPlus: true },
  },
  {
    key: 'chatbot',
    title: 'AI Chatbot',
    description: 'Talk to an AI mechanic assistant for help diagnosing and learning.',
    access: { diy: false, pro: true, proPlus: true, addOnAvailable: true },
  },
  {
    key: 'smart_scheduling',
    title: 'Smart Scheduling',
    description: 'Optimize your shop’s schedule with AI-based job priority logic.',
    access: { diy: false, pro: true, proPlus: true },
  },
  {
    key: 'customer_portal',
    title: 'Customer Portal',
    description: 'Let customers view quotes, photos, and approve work online.',
    access: { diy: false, pro: true, proPlus: true },
  },
  {
    key: 'voice_input',
    title: 'Voice Input',
    description: 'Add repairs, inspections, and job notes hands-free using voice.',
    access: { diy: false, pro: true, proPlus: true },
  },
  {
    key: 'parts_lookup',
    title: 'Parts Lookup',
    description: 'Search and price parts in real time through connected suppliers.',
    access: { diy: false, pro: true, proPlus: true },
  },
  {
    key: 'deferred_work_tracking',
    title: 'Deferred Tracking',
    description: 'Automatically track declined work for follow-up.',
    access: { diy: false, pro: true, proPlus: true },
  },
];

// Optional: key-to-feature lookup
export const featureMap = Object.fromEntries(
  features.map(f => [f.key, f])
) as { [k in FeatureKey]: Feature };