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

export type MarketingMediaUsage = {
  pageKey: MarketingPageKey;
  pageLabel: string;
  href: string;
  slotKey: string;
  slotLabel: string;
  state: "draft" | "published";
};

type MarketingMediaDeletionActor = {
  operatorId: string;
  operatorEmail: string;
};

type MarketingMediaDeletionMarker = {
  assetId: string;
  asset: MarketingMediaAsset;
  state: "deleting" | "deleted" | "failed";
  updatedAt: string;
  operatorId?: string;
  operatorEmail?: string;
};

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

function deletionMarkerPath(assetId: string): string {
  return `deleting/${assetId}.json`;
}

function deletionAuditPath(assetId: string): string {
  return `audit/media-deletions/${assetId}.json`;
}

function parseDeletionMarker(
  value: unknown,
): { success: true; data: MarketingMediaDeletionMarker } | { success: false } {
  if (!value || typeof value !== "object") return { success: false };
  const candidate = value as Partial<MarketingMediaDeletionMarker>;
  const parsedAsset = MarketingMediaAssetSchema.safeParse(candidate.asset);
  if (
    typeof candidate.assetId !== "string" ||
    !parsedAsset.success ||
    !["deleting", "deleted", "failed"].includes(String(candidate.state)) ||
    typeof candidate.updatedAt !== "string"
  ) {
    return { success: false };
  }
  return {
    success: true,
    data: {
      assetId: candidate.assetId,
      asset: parsedAsset.data,
      state: candidate.state as MarketingMediaDeletionMarker["state"],
      updatedAt: candidate.updatedAt,
      operatorId: typeof candidate.operatorId === "string" ? candidate.operatorId : undefined,
      operatorEmail: typeof candidate.operatorEmail === "string" ? candidate.operatorEmail : undefined,
    },
  };
}

async function getDeletionMarker(assetId: string): Promise<MarketingMediaDeletionMarker | null> {
  const marker = await readStoredJson(deletionMarkerPath(assetId), parseDeletionMarker);
  return marker?.assetId === assetId ? marker : null;
}

async function writeDeletionMarker(
  asset: MarketingMediaAsset,
  state: MarketingMediaDeletionMarker["state"],
  actor?: MarketingMediaDeletionActor,
): Promise<void> {
  await writeStoredJson(deletionMarkerPath(asset.id), {
    assetId: asset.id,
    asset,
    state,
    updatedAt: new Date().toISOString(),
    operatorId: actor?.operatorId,
    operatorEmail: actor?.operatorEmail,
  } satisfies MarketingMediaDeletionMarker);
}

async function writeDeletionAudit(
  asset: MarketingMediaAsset,
  actor: MarketingMediaDeletionActor,
  state: "intent" | "blocked" | "completed",
): Promise<void> {
  const now = new Date().toISOString();
  await writeStoredJson(deletionAuditPath(asset.id), {
    action: "marketing_media_delete",
    state,
    assetId: asset.id,
    filename: asset.filename,
    storagePath: asset.storagePath,
    contentType: asset.contentType,
    operatorId: actor.operatorId,
    operatorEmail: actor.operatorEmail,
    updatedAt: now,
  });
}

async function isMarketingMediaAssetUnavailable(assetId: string): Promise<boolean> {
  const marker = await getDeletionMarker(assetId);
  return marker?.state === "deleting" || marker?.state === "deleted";
}

async function isMarketingMediaAssetDeleted(assetId: string): Promise<boolean> {
  const marker = await getDeletionMarker(assetId);
  return marker?.state === "deleted";
}

async function readMarketingMediaSlotRaw(
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

async function hydrateCanonicalAsset(
  asset: MarketingMediaAsset | null,
): Promise<MarketingMediaAsset | null> {
  if (!asset) return null;
  if (await isMarketingMediaAssetDeleted(asset.id)) return null;
  try {
    const canonical = await getMarketingMediaAsset(asset.id);
    if (await isMarketingMediaAssetDeleted(asset.id)) return null;
    return canonical ?? asset;
  } catch (error) {
    console.warn("marketing media canonical hydration failed; using embedded slot asset", {
      assetId: asset.id,
      error,
    });
    return (await isMarketingMediaAssetDeleted(asset.id)) ? null : asset;
  }
}

async function readMarketingMediaSlot(
  pageKey: MarketingPageKey,
  slotKey: string,
): Promise<MarketingMediaSlot> {
  const raw = await readMarketingMediaSlotRaw(pageKey, slotKey);
  const [draft, published] = await Promise.all([
    hydrateCanonicalAsset(raw.draft),
    hydrateCanonicalAsset(raw.published),
  ]);
  return { draft, published, publishedAt: raw.publishedAt };
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

async function getAssignableMarketingMediaAsset(assetId: string): Promise<MarketingMediaAsset | null> {
  if (await isMarketingMediaAssetUnavailable(assetId)) return null;
  const asset = await getMarketingMediaAsset(assetId);
  if (!asset) return null;
  if (await isMarketingMediaAssetUnavailable(assetId)) return null;
  return asset;
}

async function getPublishableMarketingMediaAsset(
  embedded: MarketingMediaAsset,
): Promise<MarketingMediaAsset | null> {
  if (await isMarketingMediaAssetUnavailable(embedded.id)) return null;
  let canonical: MarketingMediaAsset | null = null;
  try {
    canonical = await getMarketingMediaAsset(embedded.id);
  } catch (error) {
    console.warn("marketing media canonical publish hydration failed; using embedded draft", {
      assetId: embedded.id,
      error,
    });
  }
  if (await isMarketingMediaAssetUnavailable(embedded.id)) return null;
  return canonical ?? embedded;
}

export async function getMarketingMediaUsageMap(): Promise<Record<string, MarketingMediaUsage[]>> {
  const usageMap: Record<string, MarketingMediaUsage[]> = {};

  await Promise.all(
    (Object.keys(MARKETING_PAGE_REGISTRY) as MarketingPageKey[]).map(async (pageKey) => {
      const definition = MARKETING_PAGE_REGISTRY[pageKey];
      const slotDefinitions = definition.slots as Record<string, { label: string }>;
      const slotKeys = Object.keys(slotDefinitions);
      const slots = await Promise.all(
        slotKeys.map(async (slotKey) => [slotKey, await readMarketingMediaSlotRaw(pageKey, slotKey)] as const),
      );
      for (const [slotKey, slot] of slots) {
        const common = {
          pageKey,
          pageLabel: definition.label,
          href: definition.href,
          slotKey,
          slotLabel: slotDefinitions[slotKey]?.label ?? slotKey,
        };
        if (slot.draft) {
          (usageMap[slot.draft.id] ??= []).push({ ...common, state: "draft" });
        }
        if (slot.published) {
          (usageMap[slot.published.id] ??= []).push({ ...common, state: "published" });
        }
      }
    }),
  );

  return usageMap;
}

export async function updateMarketingMediaAssetMetadata(
  assetId: string,
  input: { alt: string; caption: string | null },
): Promise<MarketingMediaAsset | null> {
  const current = await getAssignableMarketingMediaAsset(assetId);
  if (!current) return null;

  const updated = MarketingMediaAssetSchema.parse({
    ...current,
    alt: input.alt,
    caption: input.caption,
  });

  await writeStoredJson(`assets/${assetId}.json`, updated);

  const marker = await getDeletionMarker(assetId);
  if (marker?.state === "deleted") {
    await removeStoredJson(`assets/${assetId}.json`);
    return null;
  }
  return updated;
}

export async function deleteMarketingMediaAsset(
  assetId: string,
  requestedBy: MarketingMediaDeletionActor,
): Promise<{
  deleted: boolean;
  usages: MarketingMediaUsage[];
  asset: MarketingMediaAsset | null;
}> {
  const existingMarker = await getDeletionMarker(assetId);
  const canonical = await getMarketingMediaAsset(assetId);
  const asset = canonical ?? existingMarker?.asset ?? null;
  if (!asset) return { deleted: false, usages: [], asset: null };

  const recoveryActor =
    existingMarker?.state === "deleting" && existingMarker.operatorId && existingMarker.operatorEmail
      ? { operatorId: existingMarker.operatorId, operatorEmail: existingMarker.operatorEmail }
      : requestedBy;
  const actor: MarketingMediaDeletionActor =
    existingMarker?.state === "deleted" && existingMarker.operatorId && existingMarker.operatorEmail
      ? { operatorId: existingMarker.operatorId, operatorEmail: existingMarker.operatorEmail }
      : recoveryActor;

  if (existingMarker?.state === "deleted") {
    await writeDeletionAudit(asset, actor, "completed");
    return { deleted: true, usages: [], asset };
  }

  await writeDeletionAudit(asset, actor, "intent");
  await writeDeletionMarker(asset, "deleting", actor);
  let mediaRemoved = false;

  try {
    const usageMap = await getMarketingMediaUsageMap();
    const usages = usageMap[assetId] ?? [];
    if (usages.length > 0) {
      await writeDeletionMarker(asset, "failed", actor);
      await writeDeletionAudit(asset, actor, "blocked");
      return { deleted: false, usages, asset };
    }

    const admin = createAdminSupabase();
    const { error } = await admin.storage.from(MARKETING_MEDIA_BUCKET).remove([asset.storagePath]);
    if (error && !isStorageObjectMissing(error)) {
      throw new Error(`Marketing media object delete failed: ${error.message}`);
    }
    mediaRemoved = true;

    await removeStoredJson(`assets/${assetId}.json`);
    await writeDeletionMarker(asset, "deleted", actor);
    await writeDeletionAudit(asset, actor, "completed");
    return { deleted: true, usages: [], asset };
  } catch (error) {
    if (!mediaRemoved) {
      try {
        await writeDeletionMarker(asset, "failed", actor);
      } catch (markerError) {
        console.error("marketing media deletion recovery marker write failed", {
          assetId,
          markerError,
        });
      }
    }
    throw error;
  }
}

export async function saveMarketingPageMediaDraft(
  pageKey: MarketingPageKey,
  slotKey: string,
  asset: MarketingMediaAsset,
): Promise<void> {
  const canonical = await getAssignableMarketingMediaAsset(asset.id);
  if (!canonical) throw new Error("Marketing media asset is unavailable");

  const record = MarketingMediaSlotSchema.parse({
    draft: canonical,
    published: null,
    publishedAt: null,
  });
  const path = draftSlotPath(pageKey, slotKey);
  await writeStoredJson(path, record);

  const stillAvailable = await getAssignableMarketingMediaAsset(asset.id);
  if (!stillAvailable) {
    const current = await readStoredJson(path, (value) => MarketingMediaSlotSchema.safeParse(value));
    if (current?.draft?.id === asset.id) {
      await removeStoredJson(path);
    }
    throw new Error("Marketing media asset became unavailable while saving the draft");
  }
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
  const draftPath = draftSlotPath(pageKey, slotKey);
  const draftRecord = await readStoredJson(draftPath, (value) =>
    MarketingMediaSlotSchema.safeParse(value),
  );
  const draftAsset = draftRecord?.draft ?? null;
  if (!draftAsset) return null;

  const asset = await getPublishableMarketingMediaAsset(draftAsset);
  if (!asset) return null;

  const path = publishedSlotPath(pageKey, slotKey);
  const previousRecord = await readStoredJson(path, (value) =>
    MarketingMediaSlotSchema.safeParse(value),
  );
  const publishedAt = new Date().toISOString();
  const record = MarketingMediaSlotSchema.parse({
    draft: null,
    published: asset,
    publishedAt,
  });
  await writeStoredJson(path, record);

  if (await isMarketingMediaAssetUnavailable(asset.id)) {
    const current = await readStoredJson(path, (value) => MarketingMediaSlotSchema.safeParse(value));
    if (current?.published?.id === asset.id && current.publishedAt === publishedAt) {
      if (previousRecord) {
        await writeStoredJson(path, previousRecord);
      } else {
        await removeStoredJson(path);
      }
    }
    return null;
  }
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
