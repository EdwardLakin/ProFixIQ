// /lib/plan/features.ts

type FeatureAccess = {
  diy: boolean;              // Available to DIY (false means gated unless paid)
  pro: boolean;              // Available to Pro users
  proPlus: boolean;          // Available to ProFixIQ Elite users
  addOnAvailable?: boolean;  // Can DIY users pay per use?
};

type FeatureMap = {
  [featureName: string]: FeatureAccess;
};

export const features: FeatureMap = {
  'ai-diagnosis': {
    diy: false,
    pro: true,
    proPlus: true,
    addOnAvailable: true,
  },
  'photo-diagnosis': {
    diy: false,
    pro: true,
    proPlus: true,
    addOnAvailable: true,
  },
  'dtc-decoder': {
    diy: false,
    pro: true,
    proPlus: true,
    addOnAvailable: true,
  },
  'quote-builder': {
    diy: false,
    pro: true,
    proPlus: true,
    addOnAvailable: true,
  },
  'inspection-wizard': {
    diy: false,
    pro: true,
    proPlus: true,
    addOnAvailable: true,
  },
  'tech-chat': {
    diy: false,
    pro: true,
    proPlus: true,
    addOnAvailable: true,
  },
  'smart-checklist': {
    diy: false,
    pro: true,
    proPlus: true,
  },
  'parts-lookup': {
    diy: false,
    pro: true,
    proPlus: true,
  },
  'smart-scheduler': {
    diy: false,
    pro: true,
    proPlus: true,
  },
};

export type { FeatureAccess, FeatureMap };