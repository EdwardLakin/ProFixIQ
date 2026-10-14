import { z } from "zod";

export const MARKETING_MEDIA_PUBLIC_BUCKET = "marketing-page-media";

export const MarketingMediaKindSchema = z.enum(["image", "video"]);

export const MarketingMediaAssetSchema = z.object({
  id: z.string().uuid(),
  kind: MarketingMediaKindSchema,
  url: z.string().url(),
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  alt: z.string().trim().min(1).max(240),
  caption: z.string().trim().max(300).nullable().default(null),
  createdAt: z.string().datetime(),
});

export type MarketingMediaAsset = z.infer<typeof MarketingMediaAssetSchema>;

export const MarketingMediaSlotSchema = z.object({
  draft: MarketingMediaAssetSchema.nullable().default(null),
  published: MarketingMediaAssetSchema.nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
});

export type MarketingMediaSlot = z.infer<typeof MarketingMediaSlotSchema>;

export const MarketingPageMediaDocumentSchema = z.object({
  version: z.literal(1),
  pageKey: z.string().regex(/^[a-z0-9-]+$/),
  slots: z.record(z.string(), MarketingMediaSlotSchema),
  updatedAt: z.string().datetime(),
});

export type MarketingPageMediaDocument = z.infer<
  typeof MarketingPageMediaDocumentSchema
>;

export const MarketingMediaUpdateSchema = z
  .object({
    slotKey: z.string().regex(/^[a-z0-9-]+$/),
    action: z.enum(["save-draft", "publish", "clear-draft"]),
    assetId: z.string().uuid().optional(),
  })
  .strict();

type MarketingPageDefinition = {
  label: string;
  href: string;
  slots: Record<string, { label: string; description: string }>;
};

const productProofSlot = {
  "product-proof": {
    label: "Product proof media",
    description:
      "Primary real-product screenshot or reel shown in the product proof section.",
  },
} as const;

export const MARKETING_PAGE_REGISTRY = {
  home: {
    label: "Homepage",
    href: "/",
    slots: {
      hero: {
        label: "Hero product media",
        description:
          "Primary product screenshot or reel beside the homepage headline.",
      },
      inspection: {
        label: "Voice inspection story",
        description:
          "Screenshot or reel for the homepage voice-inspection product story.",
      },
      approval: {
        label: "Customer approval story",
        description:
          "Screenshot or reel for the connected customer-approval product story.",
      },
      operations: {
        label: "Operations story",
        description:
          "Screenshot or reel for the end-to-end shop operations product story.",
      },
      onboarding: {
        label: "Shop Boost onboarding",
        description:
          "Screenshot or reel for the homepage Shop Boost onboarding section.",
      },
    },
  },
  "repair-shop-management": {
    label: "Repair Shop Management",
    href: "/repair-shop-management-software",
    slots: productProofSlot,
  },
  "heavy-duty-shop-management": {
    label: "Heavy-Duty Shop Management",
    href: "/heavy-duty-shop-management-software",
    slots: productProofSlot,
  },
  "diesel-repair-shop": {
    label: "Diesel Repair Shop",
    href: "/diesel-repair-shop-software",
    slots: productProofSlot,
  },
  "heavy-duty-work-order": {
    label: "Heavy-Duty Work Orders",
    href: "/heavy-duty-work-order-software",
    slots: productProofSlot,
  },
  "heavy-duty-inspection": {
    label: "Heavy-Duty Inspections",
    href: "/heavy-duty-inspection-software",
    slots: productProofSlot,
  },
  "fleet-repair-management": {
    label: "Fleet Repair Management",
    href: "/fleet-repair-management-software",
    slots: productProofSlot,
  },
  "fleet-preventive-maintenance": {
    label: "Fleet Preventive Maintenance",
    href: "/fleet-preventive-maintenance-software",
    slots: productProofSlot,
  },
  "mobile-truck-repair": {
    label: "Mobile Truck Repair",
    href: "/mobile-truck-repair-software",
    slots: productProofSlot,
  },
  "service-truck-work-order": {
    label: "Service Truck Work Orders",
    href: "/service-truck-work-order-software",
    slots: productProofSlot,
  },
  "equipment-maintenance": {
    label: "Equipment Maintenance",
    href: "/equipment-maintenance-software",
    slots: productProofSlot,
  },
  "heavy-equipment-repair": {
    label: "Heavy Equipment Repair",
    href: "/heavy-equipment-repair-software",
    slots: productProofSlot,
  },
  "off-highway-equipment-repair": {
    label: "Off-Highway Equipment Repair",
    href: "/off-highway-equipment-repair-software",
    slots: productProofSlot,
  },
  "fullbay-alternative": {
    label: "Fullbay Alternative",
    href: "/compare/fullbay-alternative",
    slots: productProofSlot,
  },
  "profixiq-vs-fullbay": {
    label: "ProFixIQ vs Fullbay",
    href: "/compare/profixiq-vs-fullbay",
    slots: productProofSlot,
  },
} as const satisfies Record<string, MarketingPageDefinition>;

export type MarketingPageKey = keyof typeof MARKETING_PAGE_REGISTRY;

export function getMarketingPageKeyForHref(href: string): MarketingPageKey | null {
  const entry = Object.entries(MARKETING_PAGE_REGISTRY).find(
    ([, definition]) => definition.href === href,
  );
  return (entry?.[0] as MarketingPageKey | undefined) ?? null;
}
