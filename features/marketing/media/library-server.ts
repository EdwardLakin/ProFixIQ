import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  MARKETING_MEDIA_PUBLIC_BUCKET,
  MarketingMediaAssetSchema,
  MarketingMediaLibraryAssetSchema,
  type MarketingMediaAsset,
  type MarketingMediaLibraryAsset,
} from "./types";
import { MARKETING_MEDIA_CONTENT_BUCKET } from "./server";

const LIBRARY_LOCK_PREFIX = "library-locks";

function isStorageObjectMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; message?: string };
  const statusCode = String(candidate.statusCode ?? "");
  const message = String(candidate.message ?? "").toLowerCase();
  return statusCode === "404" || message.includes("object not found");
}

function isStorageObjectAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; code?: string; message?: string };
  const statusCode = String(candidate.statusCode ?? "");
  const code = String(candidate.code ?? "").toLowerCase();
  const message = String(candidate.message ?? "").toLowerCase();
  return (
    statusCode === "409" ||
    code === "resourcealreadyexists" ||
    code === "already_exists" ||
    message.includes("already exists")
  );
}

async function readLibraryAsset(assetId: string): Promise<MarketingMediaLibraryAsset | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .download(`assets/${assetId}.json`);
  if (error) {
    if (isStorageObjectMissing(error)) return null;
    throw new Error(`Marketing media library read failed: ${error.message}`);
  }
  if (!data) return null;
  const parsed = MarketingMediaLibraryAssetSchema.safeParse(JSON.parse(await data.text()));
  if (!parsed.success) throw new Error("Marketing media library metadata is invalid");
  return parsed.data;
}

async function acquireLibraryLock(assetId: string): Promise<string> {
  const admin = createAdminSupabase();
  const path = `${LIBRARY_LOCK_PREFIX}/${assetId}.json`;
  const body = Buffer.from(
    `${JSON.stringify({ assetId, createdAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: false,
    });
  if (!error) return path;
  if (isStorageObjectAlreadyExists(error)) {
    throw new Error("Marketing media library asset is being changed by another request");
  }
  throw new Error(`Marketing media library lock failed: ${error.message}`);
}

async function releaseLibraryLock(path: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.storage.from(MARKETING_MEDIA_CONTENT_BUCKET).remove([path]);
  if (error && !isStorageObjectMissing(error)) {
    console.warn("marketing media library lock cleanup failed", { path, error });
  }
}

export async function getMarketingMediaLibraryAsset(
  assetId: string,
): Promise<MarketingMediaLibraryAsset | null> {
  return readLibraryAsset(assetId);
}

export async function updateIncompleteMarketingMediaMetadata(
  assetId: string,
  input: { alt: string; caption: string | null },
): Promise<MarketingMediaAsset | null> {
  const lockPath = await acquireLibraryLock(assetId);
  try {
    const current = await readLibraryAsset(assetId);
    if (!current) return null;
    if (MarketingMediaAssetSchema.safeParse(current).success) return null;

    const updated = MarketingMediaAssetSchema.parse({
      ...current,
      alt: input.alt,
      caption: input.caption,
    });
    const admin = createAdminSupabase();
    const body = Buffer.from(`${JSON.stringify(updated, null, 2)}\n`, "utf8");
    const { error } = await admin.storage
      .from(MARKETING_MEDIA_CONTENT_BUCKET)
      .upload(`assets/${assetId}.json`, body, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: true,
      });
    if (error) throw new Error(`Marketing media library metadata update failed: ${error.message}`);
    return updated;
  } finally {
    await releaseLibraryLock(lockPath);
  }
}

export async function deleteIncompleteMarketingMediaAsset(
  assetId: string,
): Promise<MarketingMediaLibraryAsset | null> {
  const lockPath = await acquireLibraryLock(assetId);
  try {
    const current = await readLibraryAsset(assetId);
    if (!current) return null;
    if (MarketingMediaAssetSchema.safeParse(current).success) return null;

    const admin = createAdminSupabase();
    const { error: mediaError } = await admin.storage
      .from(MARKETING_MEDIA_PUBLIC_BUCKET)
      .remove([current.storagePath]);
    if (mediaError && !isStorageObjectMissing(mediaError)) {
      throw new Error(`Marketing media library object delete failed: ${mediaError.message}`);
    }

    const { error: metadataError } = await admin.storage
      .from(MARKETING_MEDIA_CONTENT_BUCKET)
      .remove([`assets/${assetId}.json`]);
    if (metadataError && !isStorageObjectMissing(metadataError)) {
      throw new Error(`Marketing media library metadata delete failed: ${metadataError.message}`);
    }
    return current;
  } finally {
    await releaseLibraryLock(lockPath);
  }
}
