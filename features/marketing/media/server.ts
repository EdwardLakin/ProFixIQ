import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  MARKETING_MEDIA_PUBLIC_BUCKET,
  MarketingMediaAssetSchema,
  MarketingMediaSlotSchema,
  MARKETING_PAGE_REGISTRY,
  type MarketingMediaAsset,
  type MarketingMediaSlot,
  type MarketingPageKey,
  type MarketingPageMediaDocument,
} from "./types";

export const MARKETING_MEDIA_CONTENT_BUCKET = "marketing-page-content";
export const MARKETING_MEDIA_BUCKET = MARKETING_MEDIA_PUBLIC_BUCKET;

export function isMarketingPageKey(value: string): value is MarketingPageKey {
  return Object.prototype.hasOwnProperty.call(MARKETING_PAGE_REGISTRY, value);
}

function isStorageObjectMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; message?: string };
  const statusCode = String(candidate.statusCode ?? "");
  const message = String(candidate.message ?? "").toLowerCase();
  return statusCode === "404" || message.includes("object not found");
}

async function readStoredJson<T>(
  path: string,
  parse: (value: unknown) => { success: true; data: T } | { success: false },
): Promise<T | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .download(path);

  if (error) {
    if (isStorageObjectMissing(error)) return null;
    throw new Error(`Marketing media read failed for ${path}: ${error.message}`);
  }
  if (!data) throw new Error(`Marketing media read returned no data for ${path}`);

  let json: unknown;
  try {
    json = JSON.parse(await data.text());
  } catch (error) {
    throw new Error(
      `Marketing media JSON parsing failed for ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const parsed = parse(json);
  if (!parsed.success) {
    throw new Error(`Marketing media schema validation failed for ${path}`);
  }
  return parsed.data;
}

async function writeStoredJson(path: string, value: unknown): Promise<void> {
  const admin = createAdminSupabase();
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
  if (error) throw new Error(`Marketing media write failed for ${path}: ${error.message}`);
}

async function removeStoredJson(path: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.storage.from(MARKETING_MEDIA_CONTENT_BUCKET).remove([path]);
  if (error && !isStorageObjectMissing(error)) {
    throw new Error(`Marketing media delete failed for ${path}: ${error.message}`);
  }
}

function draftSlotPath(pageKey: MarketingPageKey, slotKey: string): string {
  return `pages/${pageKey}/${slotKey}/draft.json`;
}

function publishedSlotPath(pageKey: MarketingPageKey, slotKey: string): string {
  return `pages/${pageKey}/${slotKey}/published.json`;
}

async function readMarketingMediaSlot(
  pageKey: MarketingPageKey,
  slotKey: string,
): Promise<MarketingMediaSlot> {
  const [draftRecord, publishedRecord] = await Promise.all([
    readStoredJson(draftSlotPath(pageKey, slotKey), (value) =>
      MarketingMediaSlotSchema.safeParse(value),
    ),
    readStoredJson(publishedSlotPath(pageKey, slotKey), (value) =>
      MarketingMediaSlotSchema.safeParse(value),
    ),
  ]);

  return {
    draft: draftRecord?.draft ?? null,
    published: publishedRecord?.published ?? null,
    publishedAt: publishedRecord?.publishedAt ?? null,
  };
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
  const slotKeys = Object.keys(MARKETING_PAGE_REGISTRY[pageKey].slots);
  const entries = await Promise.all(
    slotKeys.map(async (slotKey) => [slotKey, await readMarketingMediaSlot(pageKey, slotKey)] as const),
  );
  const slots = Object.fromEntries(entries);
  const timestamps = entries.flatMap(([, slot]) => [
    slot.draft?.createdAt ?? new Date(0).toISOString(),
    slot.publishedAt ?? new Date(0).toISOString(),
  ]);
  const updatedAt = timestamps.sort().at(-1) ?? new Date(0).toISOString();

  return { version: 1, pageKey, slots, updatedAt };
}

export async function getMarketingMediaAsset(
  assetId: string,
): Promise<MarketingMediaAsset | null> {
  return readStoredJson(`assets/${assetId}.json`, (value) =>
    MarketingMediaAssetSchema.safeParse(value),
  );
}

export async function saveMarketingPageMediaDraft(
  pageKey: MarketingPageKey,
  slotKey: string,
  asset: MarketingMediaAsset,
): Promise<void> {
  const record = MarketingMediaSlotSchema.parse({
    draft: asset,
    published: null,
    publishedAt: null,
  });
  await writeStoredJson(draftSlotPath(pageKey, slotKey), record);
}

export async function clearMarketingPageMediaDraft(
  pageKey: MarketingPageKey,
  slotKey: string,
): Promise<void> {
  await removeStoredJson(draftSlotPath(pageKey, slotKey));
}

export async function publishMarketingPageMediaDraft(
  pageKey: MarketingPageKey,
  slotKey: string,
): Promise<MarketingMediaAsset | null> {
  const draftRecord = await readStoredJson(draftSlotPath(pageKey, slotKey), (value) =>
    MarketingMediaSlotSchema.safeParse(value),
  );
  const asset = draftRecord?.draft ?? null;
  if (!asset) return null;

  const record = MarketingMediaSlotSchema.parse({
    draft: null,
    published: asset,
    publishedAt: new Date().toISOString(),
  });
  await writeStoredJson(publishedSlotPath(pageKey, slotKey), record);
  return asset;
}

export async function getPublishedMarketingPageMedia(
  pageKey: MarketingPageKey,
): Promise<Record<string, MarketingMediaAsset>> {
  const document = await getMarketingPageMediaDocument(pageKey);
  return Object.fromEntries(
    Object.entries(document.slots)
      .filter(([, slot]) => Boolean(slot.published))
      .map(([slotKey, slot]) => [slotKey, slot.published as MarketingMediaAsset]),
  );
}
