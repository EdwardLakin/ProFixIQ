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

export const MarketingMediaUpdateSchema = z.object({
  slotKey: z.string().regex(/^[a-z0-9-]+$/),
  action: z.enum(["save-draft", "publish", "clear-draft"]),
  assetId: z.string().uuid().optional(),
});

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
    },
  },
} as const;

export type MarketingPageKey = keyof typeof MARKETING_PAGE_REGISTRY;
