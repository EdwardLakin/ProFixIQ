import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  MARKETING_MEDIA_PUBLIC_BUCKET,
  MarketingMediaAssetSchema,
  MarketingMediaLibraryAssetSchema,
  type MarketingMediaAsset,
  type MarketingMediaLibraryAsset,
} from "./types";
import {
  deleteMarketingMediaAsset,
  getMarketingMediaUsageMap,
  MARKETING_MEDIA_CONTENT_BUCKET,
  updateMarketingMediaAssetMetadata,
  type MarketingMediaUsage,
} from "./server";

const LIBRARY_DELETING_PREFIX = "library-deleting";
const LIBRARY_DELETED_PREFIX = "library-deleted";
const ASSIGNMENT_RESERVATION_TTL_MS = 5 * 60 * 1000;

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

type MarketingMediaAssignmentReservation = {
  assetId: string;
  reservationId: string;
  createdAt: string;
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

function parseAssignmentReservation(value: unknown): MarketingMediaAssignmentReservation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MarketingMediaAssignmentReservation>;
  if (
    typeof candidate.assetId !== "string" ||
    typeof candidate.reservationId !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }
  return {
    assetId: candidate.assetId,
    reservationId: candidate.reservationId,
    createdAt: candidate.createdAt,
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
  if (
    candidate.assetId !== assetId ||
    !["deleting", "deleted", "failed"].includes(String(candidate.state))
  ) {
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

async function readPromotionDeletionState(assetId: string): Promise<DeletionMarkerState | null> {
  const [libraryMarker, canonicalState] = await Promise.all([
    readLibraryDeletionMarker(assetId),
    readCanonicalDeletionState(assetId),
  ]);
  if (libraryMarker?.state === "deleted" || canonicalState === "deleted") return "deleted";
  if (libraryMarker?.state === "deleting" || canonicalState === "deleting") return "deleting";
  if (libraryMarker?.state === "failed" || canonicalState === "failed") return "failed";
  return null;
}

async function deletionBlocksPromotion(assetId: string): Promise<boolean> {
  const state = await readPromotionDeletionState(assetId);
  return state === "deleting" || state === "deleted";
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
  state: "intent" | "blocked" | "completed",
): Promise<void> {
  await writeJson(
    `audit/media-deletions/${asset.id}.json`,
    {
      action: "marketing_media_delete",
      state,
      assetId: asset.id,
      filename: asset.filename,
      storagePath: asset.storagePath,
      contentType: asset.contentType,
      operatorId: actor.operatorId,
      operatorEmail: actor.operatorEmail,
      updatedAt: new Date().toISOString(),
    },
    true,
  );
}

async function hasAssignmentReservations(assetId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .list(`assigning/${assetId}`, { limit: 1000 });
  if (error) throw new Error(`Marketing media library reservation list failed: ${error.message}`);

  const now = Date.now();
  let hasActiveReservation = false;
  for (const item of data ?? []) {
    if (!item.name.endsWith(".json")) continue;
    const path = `assigning/${assetId}/${item.name}`;
    try {
      const reservation = parseAssignmentReservation(await readJson(path));
      if (!reservation) continue;
      const createdAt = Date.parse(reservation.createdAt);
      const expired = !Number.isFinite(createdAt) || now - createdAt > ASSIGNMENT_RESERVATION_TTL_MS;
      if (expired) {
        await removeJson(path);
        continue;
      }
      hasActiveReservation = true;
    } catch (reservationError) {
      console.warn("marketing media library reservation recovery read failed; treating reservation as active", {
        assetId,
        path,
        reservationError,
      });
      hasActiveReservation = true;
    }
  }
  return hasActiveReservation;
}

async function waitForAssignmentReservations(assetId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!(await hasAssignmentReservations(assetId))) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !(await hasAssignmentReservations(assetId));
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
  if (MarketingMediaAssetSchema.safeParse(current).success) {
    return updateMarketingMediaAssetMetadata(assetId, input);
  }

  const updated = MarketingMediaAssetSchema.parse({
    ...current,
    alt: input.alt,
    caption: input.caption,
  });
  await writeJson(`assets/${assetId}.json`, updated, true);

  const deletionState = await readPromotionDeletionState(assetId);
  if (deletionState === "deleted") {
    // Terminal deletion means storage is gone. Remove only metadata recreated after that
    // terminal winner; transient/failed deletion remains owned by the deletion protocol.
    await removeJson(`assets/${assetId}.json`);
    return null;
  }
  if (deletionState === "deleting") return null;

  return updated;
}

export async function deleteIncompleteMarketingMediaAsset(
  assetId: string,
  requestedBy: MarketingMediaDeletionActor,
): Promise<{
  deleted: boolean;
  usages: MarketingMediaUsage[];
  asset: MarketingMediaLibraryAsset | null;
}> {
  let mediaRemoved = false;
  let current: MarketingMediaLibraryAsset | null = null;
  let actor = requestedBy;
  try {
    const existingMarker = await readLibraryDeletionMarker(assetId);
    current = (await readLibraryAsset(assetId)) ?? existingMarker?.asset ?? null;
    if (!current) return { deleted: false, usages: [], asset: null };

    actor =
      (existingMarker?.state === "deleting" || existingMarker?.state === "deleted") &&
      existingMarker.operatorId &&
      existingMarker.operatorEmail
        ? { operatorId: existingMarker.operatorId, operatorEmail: existingMarker.operatorEmail }
        : requestedBy;

    if (existingMarker?.state === "deleted") {
      // Terminal retries are also recovery passes. If the original post-tombstone metadata
      // cleanup failed after storage deletion, keep retrying that cleanup before reporting
      // success so a ghost library record cannot remain permanently listable.
      await removeJson(`assets/${assetId}.json`);
      await writeDeletionAudit(current, actor, "completed");
      await removeJson(`${LIBRARY_DELETING_PREFIX}/${assetId}.json`);
      return { deleted: true, usages: [], asset: current };
    }

    if (existingMarker?.state !== "deleting") {
      await writeDeletionAudit(current, actor, "intent");
      await writeDeletionMarker(current, actor, "deleting");
    }

    // The library deletion marker is also checked by canonical assignment reservations.
    // Classify only after that fence exists so a promoted asset cannot begin a new
    // draft/publish assignment while this deletion is draining existing reservations.
    const fencedAsset = await readLibraryAsset(assetId);
    if (fencedAsset && MarketingMediaAssetSchema.safeParse(fencedAsset).success) {
      const canonicalResult = await deleteMarketingMediaAsset(assetId, actor);
      await removeJson(`${LIBRARY_DELETING_PREFIX}/${assetId}.json`);
      if (canonicalResult.asset) return canonicalResult;
      current = fencedAsset;
    }

    if (!(await waitForAssignmentReservations(assetId))) {
      await writeDeletionMarker(current, actor, "failed");
      await writeDeletionAudit(current, actor, "blocked");
      return { deleted: false, usages: [], asset: current };
    }
    const usages = (await getMarketingMediaUsageMap())[assetId] ?? [];
    if (usages.length > 0) {
      await writeDeletionMarker(current, actor, "failed");
      await writeDeletionAudit(current, actor, "blocked");
      return { deleted: false, usages, asset: current };
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
    // A promotion that started before the library fence may have recreated strict metadata
    // after the first removal. Once the immutable terminal tombstone exists, remove that
    // metadata one final time; any later promotion observes `deleted` and compensates itself.
    await removeJson(`assets/${assetId}.json`);
    current = terminal.asset;
    actor = {
      operatorId: terminal.operatorId,
      operatorEmail: terminal.operatorEmail,
    };
    await writeDeletionAudit(current, actor, "completed");
    await removeJson(`${LIBRARY_DELETING_PREFIX}/${assetId}.json`);
    return { deleted: true, usages: [], asset: current };
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