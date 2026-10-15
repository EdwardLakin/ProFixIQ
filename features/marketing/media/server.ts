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

const ASSIGNMENT_RESERVATION_TTL_MS = 5 * 60 * 1000;

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

type MarketingMediaAssignmentReservation = {
  assetId: string;
  reservationId: string;
  createdAt: string;
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

async function writeStoredJsonCreateOnly(path: string, value: unknown): Promise<boolean> {
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
  throw new Error(`Marketing media create-only write failed for ${path}: ${error.message}`);
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

function terminalDeletionMarkerPath(assetId: string): string {
  return `deleted/${assetId}.json`;
}

function deletionAuditPath(assetId: string): string {
  return `audit/media-deletions/${assetId}.json`;
}

function assignmentReservationPath(assetId: string, reservationId: string): string {
  return `assigning/${assetId}/${reservationId}.json`;
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

function parseAssignmentReservation(
  value: unknown,
): { success: true; data: MarketingMediaAssignmentReservation } | { success: false } {
  if (!value || typeof value !== "object") return { success: false };
  const candidate = value as Partial<MarketingMediaAssignmentReservation>;
  if (
    typeof candidate.assetId !== "string" ||
    typeof candidate.reservationId !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return { success: false };
  }
  return {
    success: true,
    data: {
      assetId: candidate.assetId,
      reservationId: candidate.reservationId,
      createdAt: candidate.createdAt,
    },
  };
}

async function getTerminalDeletionMarker(
  assetId: string,
): Promise<MarketingMediaDeletionMarker | null> {
  const marker = await readStoredJson(terminalDeletionMarkerPath(assetId), parseDeletionMarker);
  return marker?.assetId === assetId && marker.state === "deleted" ? marker : null;
}

async function getDeletionMarker(assetId: string): Promise<MarketingMediaDeletionMarker | null> {
  const terminal = await getTerminalDeletionMarker(assetId);
  if (terminal) return terminal;
  const marker = await readStoredJson(deletionMarkerPath(assetId), parseDeletionMarker);
  return marker?.assetId === assetId ? marker : null;
}

async function writeDeletionMarker(
  asset: MarketingMediaAsset,
  state: MarketingMediaDeletionMarker["state"],
  actor?: MarketingMediaDeletionActor,
): Promise<void> {
  if (state !== "deleted" && (await getTerminalDeletionMarker(asset.id))) return;
  await writeStoredJson(deletionMarkerPath(asset.id), {
    assetId: asset.id,
    asset,
    state,
    updatedAt: new Date().toISOString(),
    operatorId: actor?.operatorId,
    operatorEmail: actor?.operatorEmail,
  } satisfies MarketingMediaDeletionMarker);
}

async function writeTerminalDeletionMarker(
  asset: MarketingMediaAsset,
  actor: MarketingMediaDeletionActor,
): Promise<void> {
  const marker: MarketingMediaDeletionMarker = {
    assetId: asset.id,
    asset,
    state: "deleted",
    updatedAt: new Date().toISOString(),
    operatorId: actor.operatorId,
    operatorEmail: actor.operatorEmail,
  };
  await writeStoredJsonCreateOnly(terminalDeletionMarkerPath(asset.id), marker);
  await writeDeletionMarker(asset, "deleted", actor);
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
  return Boolean(await getTerminalDeletionMarker(assetId));
}

async function isMarketingMediaAssetDeletedForRead(assetId: string): Promise<boolean> {
  try {
    return await isMarketingMediaAssetDeleted(assetId);
  } catch (error) {
    console.warn("marketing media terminal deletion check failed; preserving embedded slot asset", {
      assetId,
      error,
    });
    return false;
  }
}

async function createAssignmentReservation(assetId: string): Promise<string> {
  if (await isMarketingMediaAssetUnavailable(assetId)) {
    throw new Error("Marketing media asset is unavailable");
  }
  const reservationId = crypto.randomUUID();
  const path = assignmentReservationPath(assetId, reservationId);
  const created = await writeStoredJsonCreateOnly(path, {
    assetId,
    reservationId,
    createdAt: new Date().toISOString(),
  });
  if (!created) throw new Error("Marketing media assignment reservation collision");
  if (await isMarketingMediaAssetUnavailable(assetId)) {
    await removeStoredJson(path);
    throw new Error("Marketing media asset became unavailable before assignment");
  }
  return path;
}

async function hasAssignmentReservations(assetId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .list(`assigning/${assetId}`, { limit: 1000 });
  if (error) throw new Error(`Marketing media reservation list failed: ${error.message}`);

  const now = Date.now();
  let hasActiveReservation = false;
  for (const item of data ?? []) {
    if (!item.name.endsWith(".json")) continue;
    const path = `assigning/${assetId}/${item.name}`;
    try {
      const reservation = await readStoredJson(path, parseAssignmentReservation);
      if (!reservation) continue;
      const createdAt = Date.parse(reservation.createdAt);
      const expired = !Number.isFinite(createdAt) || now - createdAt > ASSIGNMENT_RESERVATION_TTL_MS;
      if (expired) {
        await removeStoredJson(path);
        continue;
      }
      hasActiveReservation = true;
    } catch (reservationError) {
      console.warn("marketing media reservation recovery read failed; treating reservation as active", {
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
  if (await isMarketingMediaAssetDeletedForRead(asset.id)) return null;
  try {
    const canonical = await getMarketingMediaAsset(asset.id);
    if (await isMarketingMediaAssetDeletedForRead(asset.id)) return null;
    return canonical ?? asset;
  } catch (error) {
    console.warn("marketing media canonical hydration failed; using embedded slot asset", {
      assetId: asset.id,
      error,
    });
    return (await isMarketingMediaAssetDeletedForRead(asset.id)) ? null : asset;
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
  let reservationPath: string;
  try {
    reservationPath = await createAssignmentReservation(assetId);
  } catch {
    return null;
  }

  try {
    const current = await getAssignableMarketingMediaAsset(assetId);
    if (!current) return null;

    const updated = MarketingMediaAssetSchema.parse({
      ...current,
      alt: input.alt,
      caption: input.caption,
    });

    await writeStoredJson(`assets/${assetId}.json`, updated);
    return (await isMarketingMediaAssetDeleted(assetId)) ? null : updated;
  } finally {
    await removeStoredJson(reservationPath);
  }
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
    if (!(await waitForAssignmentReservations(assetId))) {
      await writeDeletionMarker(asset, "failed", actor);
      await writeDeletionAudit(asset, actor, "blocked");
      return { deleted: false, usages: [], asset };
    }

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
    await writeTerminalDeletionMarker(asset, actor);
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
  const reservationPath = await createAssignmentReservation(asset.id);
  try {
    const canonical = await getAssignableMarketingMediaAsset(asset.id);
    if (!canonical) throw new Error("Marketing media asset is unavailable");

    const record = MarketingMediaSlotSchema.parse({
      draft: canonical,
      published: null,
      publishedAt: null,
    });
    await writeStoredJson(draftSlotPath(pageKey, slotKey), record);
  } finally {
    await removeStoredJson(reservationPath);
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
  const draftRecord = await readStoredJson(draftSlotPath(pageKey, slotKey), (value) =>
    MarketingMediaSlotSchema.safeParse(value),
  );
  const draftAsset = draftRecord?.draft ?? null;
  if (!draftAsset) return null;

  let reservationPath: string;
  try {
    reservationPath = await createAssignmentReservation(draftAsset.id);
  } catch {
    return null;
  }

  try {
    const asset = await getPublishableMarketingMediaAsset(draftAsset);
    if (!asset) return null;

    const record = MarketingMediaSlotSchema.parse({
      draft: null,
      published: asset,
      publishedAt: new Date().toISOString(),
    });
    await writeStoredJson(publishedSlotPath(pageKey, slotKey), record);
    return asset;
  } finally {
    await removeStoredJson(reservationPath);
  }
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
