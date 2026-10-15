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

const LIBRARY_DELETING_PREFIX = "library-deleting";
const LIBRARY_DELETED_PREFIX = "library-deleted";

type MarketingMediaDeletionActor = {
  operatorId: string;
  operatorEmail: string;
};

type LibraryDeletionMarker = {
  assetId: string;
  asset: MarketingMediaLibraryAsset;
  state: "deleting" | "deleted" | "failed";
  updatedAt: string;
  operatorId: string;
  operatorEmail: string;
};

type DeletionMarkerState = LibraryDeletionMarker["state"];

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

async function readJson(path: string): Promise<unknown | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .download(path);
  if (error) {
    if (isStorageObjectMissing(error)) return null;
    throw new Error(`Marketing media library read failed for ${path}: ${error.message}`);
  }
  if (!data) return null;
  return JSON.parse(await data.text());
}

async function writeJson(path: string, value: unknown, upsert: boolean): Promise<void> {
  const admin = createAdminSupabase();
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert,
    });
  if (error) throw new Error(`Marketing media library write failed for ${path}: ${error.message}`);
}

async function writeJsonCreateOnly(path: string, value: unknown): Promise<boolean> {
  const admin = createAdminSupabase();
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: false,
    });
  if (!error) return true;
  if (isStorageObjectAlreadyExists(error)) return false;
  throw new Error(`Marketing media library create-only write failed for ${path}: ${error.message}`);
}

async function removeJson(path: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.storage.from(MARKETING_MEDIA_CONTENT_BUCKET).remove([path]);
  if (error && !isStorageObjectMissing(error)) {
    throw new Error(`Marketing media library delete failed for ${path}: ${error.message}`);
  }
}

async function readLibraryAsset(assetId: string): Promise<MarketingMediaLibraryAsset | null> {
  const value = await readJson(`assets/${assetId}.json`);
  if (!value) return null;
  const parsed = MarketingMediaLibraryAssetSchema.safeParse(value);
  if (!parsed.success) throw new Error("Marketing media library metadata is invalid");
  return parsed.data;
}

function parseLibraryDeletionMarker(value: unknown): LibraryDeletionMarker | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LibraryDeletionMarker>;
  const asset = MarketingMediaLibraryAssetSchema.safeParse(candidate.asset);
  if (
    typeof candidate.assetId !== "string" ||
    !asset.success ||
    !["deleting", "deleted", "failed"].includes(String(candidate.state)) ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.operatorId !== "string" ||
    typeof candidate.operatorEmail !== "string"
  ) {
    return null;
  }
  return {
    assetId: candidate.assetId,
    asset: asset.data,
    state: candidate.state as LibraryDeletionMarker["state"],
    updatedAt: candidate.updatedAt,
    operatorId: candidate.operatorId,
    operatorEmail: candidate.operatorEmail,
  };
}

async function readLibraryDeletionMarker(assetId: string): Promise<LibraryDeletionMarker | null> {
  const terminal = parseLibraryDeletionMarker(
    await readJson(`${LIBRARY_DELETED_PREFIX}/${assetId}.json`),
  );
  if (terminal?.assetId === assetId && terminal.state === "deleted") return terminal;
  const active = parseLibraryDeletionMarker(
    await readJson(`${LIBRARY_DELETING_PREFIX}/${assetId}.json`),
  );
  return active?.assetId === assetId ? active : null;
}

async function readDeletionMarkerAsset(
  path: string,
  assetId: string,
): Promise<MarketingMediaLibraryAsset | null> {
  const value = await readJson(path);
  if (!value || typeof value !== "object") return null;
  const candidate = value as { assetId?: unknown; asset?: unknown; state?: unknown };
  if (candidate.assetId !== assetId || !["deleting", "deleted", "failed"].includes(String(candidate.state))) {
    return null;
  }
  const asset = MarketingMediaLibraryAssetSchema.safeParse(candidate.asset);
  return asset.success ? asset.data : null;
}

async function readCanonicalDeletionState(assetId: string): Promise<DeletionMarkerState | null> {
  for (const path of [`deleted/${assetId}.json`, `deleting/${assetId}.json`]) {
    const value = await readJson(path);
    if (!value || typeof value !== "object") continue;
    const candidate = value as { assetId?: unknown; state?: unknown };
    const state = String(candidate.state);
    if (
      candidate.assetId === assetId &&
      ["deleting", "deleted", "failed"].includes(state)
    ) {
      return state as DeletionMarkerState;
    }
  }
  return null;
}

async function deletionBlocksPromotion(assetId: string): Promise<boolean> {
  const libraryMarker = await readLibraryDeletionMarker(assetId);
  if (libraryMarker?.state === "deleting" || libraryMarker?.state === "deleted") return true;
  const canonicalState = await readCanonicalDeletionState(assetId);
  return canonicalState === "deleting" || canonicalState === "deleted";
}

async function writeDeletionMarker(
  asset: MarketingMediaLibraryAsset,
  actor: MarketingMediaDeletionActor,
  state: Exclude<LibraryDeletionMarker["state"], "deleted">,
): Promise<void> {
  const terminal = parseLibraryDeletionMarker(
    await readJson(`${LIBRARY_DELETED_PREFIX}/${asset.id}.json`),
  );
  if (terminal?.assetId === asset.id && terminal.state === "deleted") return;

  const marker: LibraryDeletionMarker = {
    assetId: asset.id,
    asset,
    state,
    updatedAt: new Date().toISOString(),
    operatorId: actor.operatorId,
    operatorEmail: actor.operatorEmail,
  };
  await writeJson(`${LIBRARY_DELETING_PREFIX}/${asset.id}.json`, marker, true);
}

async function writeTerminalDeletionMarker(
  asset: MarketingMediaLibraryAsset,
  actor: MarketingMediaDeletionActor,
): Promise<LibraryDeletionMarker> {
  const marker: LibraryDeletionMarker = {
    assetId: asset.id,
    asset,
    state: "deleted",
    updatedAt: new Date().toISOString(),
    operatorId: actor.operatorId,
    operatorEmail: actor.operatorEmail,
  };
  const path = `${LIBRARY_DELETED_PREFIX}/${asset.id}.json`;
  if (await writeJsonCreateOnly(path, marker)) return marker;

  const winner = parseLibraryDeletionMarker(await readJson(path));
  if (!winner || winner.assetId !== asset.id || winner.state !== "deleted") {
    throw new Error(`Marketing media library terminal deletion marker is invalid for ${asset.id}`);
  }
  return winner;
}

async function writeDeletionAudit(
  asset: MarketingMediaLibraryAsset,
  actor: MarketingMediaDeletionActor,
  state: "intent" | "completed",
): Promise<void> {
  await writeJson(`audit/media-deletions/${asset.id}.json`, {
    action: "marketing_media_delete",
    state,
    assetId: asset.id,
    filename: asset.filename,
    storagePath: asset.storagePath,
    contentType: asset.contentType,
    operatorId: actor.operatorId,
    operatorEmail: actor.operatorEmail,
    updatedAt: new Date().toISOString(),
  }, true);
}

export async function getMarketingMediaLibraryAsset(
  assetId: string,
): Promise<MarketingMediaLibraryAsset | null> {
  const asset = await readLibraryAsset(assetId);
  if (asset) return asset;

  const libraryMarker = await readLibraryDeletionMarker(assetId);
  if (libraryMarker) return libraryMarker.asset;

  return (
    (await readDeletionMarkerAsset(`deleted/${assetId}.json`, assetId)) ??
    (await readDeletionMarkerAsset(`deleting/${assetId}.json`, assetId))
  );
}

export async function updateIncompleteMarketingMediaMetadata(
  assetId: string,
  input: { alt: string; caption: string | null },
): Promise<MarketingMediaAsset | null> {
  if (await deletionBlocksPromotion(assetId)) return null;

  const current = await readLibraryAsset(assetId);
  if (!current) return null;
  if (MarketingMediaAssetSchema.safeParse(current).success) return null;

  const updated = MarketingMediaAssetSchema.parse({
    ...current,
    alt: input.alt,
    caption: input.caption,
  });
  await writeJson(`assets/${assetId}.json`, updated, true);

  if (await deletionBlocksPromotion(assetId)) {
    await removeJson(`assets/${assetId}.json`);
    return null;
  }

  return updated;
}

export async function deleteIncompleteMarketingMediaAsset(
  assetId: string,
  requestedBy: MarketingMediaDeletionActor,
): Promise<MarketingMediaLibraryAsset | null> {
  let mediaRemoved = false;
  let current: MarketingMediaLibraryAsset | null = null;
  let actor = requestedBy;
  try {
    const existingMarker = await readLibraryDeletionMarker(assetId);
    current = (await readLibraryAsset(assetId)) ?? existingMarker?.asset ?? null;
    if (!current) return null;
    if (MarketingMediaAssetSchema.safeParse(current).success && !existingMarker) return null;

    actor =
      (existingMarker?.state === "deleting" || existingMarker?.state === "deleted") &&
      existingMarker.operatorId && existingMarker.operatorEmail
        ? { operatorId: existingMarker.operatorId, operatorEmail: existingMarker.operatorEmail }
        : requestedBy;

    if (existingMarker?.state === "deleted") {
      await writeDeletionAudit(current, actor, "completed");
      return current;
    }

    if (existingMarker?.state !== "deleting") {
      await writeDeletionAudit(current, actor, "intent");
      await writeDeletionMarker(current, actor, "deleting");
    }

    const admin = createAdminSupabase();
    const { error: mediaError } = await admin.storage
      .from(MARKETING_MEDIA_PUBLIC_BUCKET)
      .remove([current.storagePath]);
    if (mediaError && !isStorageObjectMissing(mediaError)) {
      throw new Error(`Marketing media library object delete failed: ${mediaError.message}`);
    }
    mediaRemoved = true;

    await removeJson(`assets/${assetId}.json`);
    const terminal = await writeTerminalDeletionMarker(current, actor);
    current = terminal.asset;
    actor = {
      operatorId: terminal.operatorId,
      operatorEmail: terminal.operatorEmail,
    };
    await writeDeletionAudit(current, actor, "completed");
    await removeJson(`${LIBRARY_DELETING_PREFIX}/${assetId}.json`);
    return current;
  } catch (error) {
    if (current && !mediaRemoved) {
      try {
        await writeDeletionMarker(current, actor, "failed");
      } catch (markerError) {
        console.error("marketing media incomplete deletion recovery marker write failed", {
          assetId,
          markerError,
        });
      }
    }
    throw error;
  }
}
