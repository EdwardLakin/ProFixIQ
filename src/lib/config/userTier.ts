export type UserTier = "diy" | "pro" | "pro+";

interface TierFeatures {
  inspections: boolean;
  workOrders: boolean;
  quoteGeneration: boolean;
  smartSummary: boolean;
  imageTagging: boolean;
  techCustomerChat: boolean;
  smartReminders: boolean;
  aiRepairStory: boolean;
  deferredWork: boolean;
  brandingTools: boolean;
  analytics: boolean;
  aiMenuMatching: boolean;
}

export function getFeatureAccess(tier: UserTier): TierFeatures {
  return {
    inspections: tier !== "diy",
    workOrders: tier !== "diy",
    quoteGeneration: tier !== "diy",
    smartSummary: tier !== "diy",
    imageTagging: tier === "pro+",
    techCustomerChat: tier === "pro+",
    smartReminders: tier === "pro+",
    aiRepairStory: tier !== "diy",
    deferredWork: tier === "pro+",
    brandingTools: tier === "pro+",
    analytics: tier === "pro+",
    aiMenuMatching: tier !== "diy",
  };
}