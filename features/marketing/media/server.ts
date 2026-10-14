import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  MarketingPageMediaDocumentSchema,
  MARKETING_PAGE_REGISTRY,
  type MarketingPageKey,
  type MarketingPageMediaDocument,
} from "./types";

export const MARKETING_MEDIA_CONTENT_BUCKET = "marketing-page-content";
export const MARKETING_MEDIA_BUCKET = "marketing-page-media";

export function isMarketingPageKey(value: string): value is MarketingPageKey {
  return Object.prototype.hasOwnProperty.call(MARKETING_PAGE_REGISTRY, value);
}

export function marketingPageStoragePath(pageKey: MarketingPageKey): string {
  return `pages/${pageKey}.json`;
}

export function emptyMarketingPageDocument(
  pageKey: MarketingPageKey,
): MarketingPageMediaDocument {
  const slotKeys = Object.keys(MARKETING_PAGE_REGISTRY[pageKey].slots);
  return {
    version: 1,
    pageKey,
    slots: Object.fromEntries(
      slotKeys.map((slotKey) => [
        slotKey,
        { draft: null, published: null, publishedAt: null },
      ]),
    ),
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getMarketingPageMediaDocument(
  pageKey: MarketingPageKey,
): Promise<MarketingPageMediaDocument> {
  noStore();
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .download(marketingPageStoragePath(pageKey));

  if (error || !data) return emptyMarketingPageDocument(pageKey);

  try {
    const parsed = MarketingPageMediaDocumentSchema.safeParse(
      JSON.parse(await data.text()),
    );
    if (!parsed.success || parsed.data.pageKey !== pageKey) {
      console.error("marketing page media failed schema validation", {
        pageKey,
        issues: parsed.success ? "page-key-mismatch" : parsed.error.issues,
      });
      return emptyMarketingPageDocument(pageKey);
    }
    return parsed.data;
  } catch (error) {
    console.error("marketing page media failed JSON parsing", { pageKey, error });
    return emptyMarketingPageDocument(pageKey);
  }
}

export async function writeMarketingPageMediaDocument(
  document: MarketingPageMediaDocument,
): Promise<void> {
  const parsed = MarketingPageMediaDocumentSchema.parse(document);
  const admin = createAdminSupabase();
  const body = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .upload(marketingPageStoragePath(parsed.pageKey as MarketingPageKey), body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) throw new Error(`Marketing page media write failed: ${error.message}`);
}

export async function getPublishedMarketingPageMedia(
  pageKey: MarketingPageKey,
): Promise<Record<string, NonNullable<MarketingPageMediaDocument["slots"][string]["published"]>>> {
  const document = await getMarketingPageMediaDocument(pageKey);
  return Object.fromEntries(
    Object.entries(document.slots)
      .filter(([, slot]) => Boolean(slot.published))
      .map(([slotKey, slot]) => [slotKey, slot.published]),
  ) as Record<
    string,
    NonNullable<MarketingPageMediaDocument["slots"][string]["published"]>
  >;
}
