import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  deleteMarketingMediaAsset,
  getMarketingMediaAsset,
  getMarketingMediaUsageMap,
  MARKETING_MEDIA_BUCKET,
  MARKETING_MEDIA_CONTENT_BUCKET,
  updateMarketingMediaAssetMetadata,
} from "@/features/marketing/media/server";
import {
  MARKETING_PAGE_REGISTRY,
  MarketingMediaAssetSchema,
  type MarketingMediaAsset,
} from "@/features/marketing/media/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const PAGE_SIZE = 100;
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const MEDIA_TYPES: Record<string, { extension: string; kind: "image" | "video" }> = {
  "image/jpeg": { extension: "jpg", kind: "image" },
  "image/png": { extension: "png", kind: "image" },
  "image/webp": { extension: "webp", kind: "image" },
  "image/avif": { extension: "avif", kind: "image" },
  "video/mp4": { extension: "mp4", kind: "video" },
  "video/webm": { extension: "webm", kind: "video" },
};

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isStorageObjectMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; message?: string };
  const statusCode = String(candidate.statusCode ?? "");
  const message = String(candidate.message ?? "").toLowerCase();
  return statusCode === "404" || message.includes("object not found");
}

async function readAssetMetadata(path: string): Promise<MarketingMediaAsset | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .download(path);
  if (error || !data) return null;
  try {
    const parsed = MarketingMediaAssetSchema.safeParse(JSON.parse(await data.text()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function contentObjectExists(path: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .download(path);
  if (error) {
    if (isStorageObjectMissing(error)) return false;
    throw new Error(`Marketing media coordination read failed for ${path}: ${error.message}`);
  }
  return Boolean(data);
}

async function writeContentJson(
  path: string,
  value: unknown,
  options: { upsert?: boolean } = {},
): Promise<void> {
  const admin = createAdminSupabase();
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: options.upsert ?? true,
    });
  if (error) throw new Error(`Marketing media coordination write failed for ${path}: ${error.message}`);
}

async function removeContentObject(path: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .remove([path]);
  if (error && !isStorageObjectMissing(error)) {
    throw new Error(`Marketing media coordination delete failed for ${path}: ${error.message}`);
  }
}

async function listJsonItems(folder: "assets" | "pending"): Promise<Array<{ name: string }>> {
  const admin = createAdminSupabase();
  const items: Array<{ name: string }> = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.storage
      .from(MARKETING_MEDIA_CONTENT_BUCKET)
      .list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "created_at", order: "desc" },
      });
    if (error) throw new Error(error.message);
    const page = data ?? [];
    items.push(...page.filter((item) => item.name.endsWith(".json")));
    if (page.length < PAGE_SIZE) break;
  }

  return items;
}

async function listAssets(): Promise<MarketingMediaAsset[]> {
  const items = await listJsonItems("assets");
  const assets = await Promise.all(
    items.map((item) => readAssetMetadata(`assets/${item.name}`)),
  );
  return assets
    .filter((asset): asset is MarketingMediaAsset => Boolean(asset))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pendingCleanupPath(assetId: string): string {
  return `pending-cleanup/${assetId}.json`;
}

async function removePendingMarker(
  pendingPath: string,
  assetId: string,
): Promise<boolean> {
  try {
    await removeContentObject(pendingPath);
    return true;
  } catch (error) {
    console.warn("marketing media pending marker cleanup failed", {
      assetId,
      error,
    });
    return false;
  }
}

async function cleanupStalePendingUploads(): Promise<number> {
  const items = await listJsonItems("pending");
  const cutoff = Date.now() - STALE_PENDING_MS;
  const admin = createAdminSupabase();
  const usageMap = await getMarketingMediaUsageMap();
  let cleaned = 0;

  for (const item of items) {
    const pendingPath = `pending/${item.name}`;
    const asset = await readAssetMetadata(pendingPath);
    if (!asset || new Date(asset.createdAt).getTime() > cutoff) continue;

    const cleanupPath = pendingCleanupPath(asset.id);
    await writeContentJson(cleanupPath, {
      assetId: asset.id,
      storagePath: asset.storagePath,
      cancelledAt: new Date().toISOString(),
    });

    const canonical = await getMarketingMediaAsset(asset.id);
    const usages = usageMap[asset.id] ?? [];
    if (canonical || usages.length > 0) {
      if (await removePendingMarker(pendingPath, asset.id)) cleaned += 1;
      await removeContentObject(cleanupPath);
      continue;
    }

    const { error: mediaError } = await admin.storage
      .from(MARKETING_MEDIA_BUCKET)
      .remove([asset.storagePath]);
    if (mediaError && !isStorageObjectMissing(mediaError)) {
      console.warn("stale marketing media object cleanup failed", {
        assetId: asset.id,
        error: mediaError,
      });
      continue;
    }

    if (await removePendingMarker(pendingPath, asset.id)) cleaned += 1;
    // Keep the cancellation marker permanently. A late finalize request can no
    // longer recreate canonical metadata for an object cleanup already removed.
  }

  return cleaned;
}

async function writeMediaDeletionAudit(input: {
  operatorId: string;
  operatorEmail: string;
  asset: MarketingMediaAsset;
}): Promise<void> {
  const timestamp = new Date().toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  await writeContentJson(
    `audit/media-deletions/${safeTimestamp}-${crypto.randomUUID()}.json`,
    {
      action: "marketing_media_deleted",
      occurredAt: timestamp,
      operatorId: input.operatorId,
      operatorEmail: input.operatorEmail,
      assetId: input.asset.id,
      filename: input.asset.filename,
      storagePath: input.asset.storagePath,
      contentType: input.asset.contentType,
    },
    { upsert: false },
  );
}

export async function GET() {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  try {
    const cleanedPending = await cleanupStalePendingUploads();
    const [assets, usages] = await Promise.all([
      listAssets(),
      getMarketingMediaUsageMap(),
    ]);
    return NextResponse.json({ assets, usages, cleanedPending });
  } catch (error) {
    console.error("ops marketing media listing failed", error);
    return NextResponse.json({ error: "Unable to load marketing media" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload || typeof payload.action !== "string") {
    return NextResponse.json({ error: "Invalid marketing media request" }, { status: 400 });
  }

  if (payload.action === "update-metadata") {
    if (!validUuid(payload.id)) {
      return NextResponse.json({ error: "Invalid marketing media asset" }, { status: 400 });
    }
    const alt = typeof payload.alt === "string" ? payload.alt.trim() : "";
    const caption = typeof payload.caption === "string" ? payload.caption.trim() : "";
    if (!alt || alt.length > 240 || caption.length > 300) {
      return NextResponse.json({ error: "Alt text is required and metadata must fit the allowed limits" }, { status: 400 });
    }

    try {
      const asset = await updateMarketingMediaAssetMetadata(payload.id, {
        alt,
        caption: caption || null,
      });
      if (!asset) {
        return NextResponse.json({ error: "That media asset is no longer available" }, { status: 404 });
      }
      const usages = (await getMarketingMediaUsageMap())[asset.id] ?? [];
      for (const usage of usages) {
        if (usage.state !== "published") continue;
        revalidatePath(`/api/public/marketing/pages/${usage.pageKey}`);
        revalidatePath(MARKETING_PAGE_REGISTRY[usage.pageKey].href);
      }
      return NextResponse.json({ asset, usages });
    } catch (error) {
      console.error("ops marketing media metadata update failed", error);
      return NextResponse.json({ error: "Unable to update marketing media" }, { status: 500 });
    }
  }

  if (payload.action === "delete") {
    if (!validUuid(payload.id)) {
      return NextResponse.json({ error: "Invalid marketing media asset" }, { status: 400 });
    }
    try {
      const result = await deleteMarketingMediaAsset(payload.id);
      if (!result.asset) {
        return NextResponse.json({ error: "That media asset is no longer available" }, { status: 404 });
      }
      if (!result.deleted) {
        return NextResponse.json(
          { error: "This media is still used by a landing page", usages: result.usages },
          { status: 409 },
        );
      }
      await writeMediaDeletionAudit({
        operatorId: access.user.id,
        operatorEmail: access.operatorEmail,
        asset: result.asset,
      });
      return NextResponse.json({ deleted: true, id: payload.id });
    } catch (error) {
      console.error("ops marketing media delete failed", error);
      return NextResponse.json({ error: "Unable to delete marketing media" }, { status: 500 });
    }
  }

  if (payload.action === "prepare-upload") {
    const filename = typeof payload.filename === "string" ? payload.filename.trim() : "";
    const contentType = typeof payload.contentType === "string" ? payload.contentType : "";
    const size = typeof payload.size === "number" ? payload.size : Number.NaN;
    const alt = typeof payload.alt === "string" ? payload.alt.trim() : "";
    const caption = typeof payload.caption === "string" ? payload.caption.trim() : "";
    const mediaType = MEDIA_TYPES[contentType];

    if (!filename || !alt) {
      return NextResponse.json({ error: "File name and alt text are required" }, { status: 400 });
    }
    if (!mediaType) {
      return NextResponse.json(
        { error: "Use JPG, PNG, WebP, AVIF, MP4, or WebM media" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_MEDIA_BYTES) {
      return NextResponse.json(
        { error: "Marketing media must be larger than 0 bytes and no more than 50 MB" },
        { status: 400 },
      );
    }
    if (alt.length > 240 || caption.length > 300) {
      return NextResponse.json({ error: "Alt text or caption is too long" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const storagePath = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${mediaType.extension}`;
    const admin = createAdminSupabase();
    const { data: publicData } = admin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(storagePath);
    const asset = MarketingMediaAssetSchema.parse({
      id,
      kind: mediaType.kind,
      url: publicData.publicUrl,
      storagePath,
      filename: filename.split(/[\\/]/).pop() || `marketing-media.${mediaType.extension}`,
      contentType,
      alt,
      caption: caption || null,
      createdAt: now.toISOString(),
    });

    const pendingBody = Buffer.from(`${JSON.stringify(asset, null, 2)}\n`, "utf8");
    const { error: pendingError } = await admin.storage
      .from(MARKETING_MEDIA_CONTENT_BUCKET)
      .upload(`pending/${id}.json`, pendingBody, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: false,
      });
    if (pendingError) {
      console.error("ops marketing media pending metadata write failed", pendingError);
      return NextResponse.json({ error: "Unable to prepare marketing media upload" }, { status: 500 });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(MARKETING_MEDIA_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (signedError || !signed?.token) {
      await admin.storage.from(MARKETING_MEDIA_CONTENT_BUCKET).remove([`pending/${id}.json`]);
      console.error("ops marketing media signed upload creation failed", signedError);
      return NextResponse.json({ error: "Unable to prepare marketing media upload" }, { status: 500 });
    }

    return NextResponse.json({ asset, path: storagePath, token: signed.token });
  }

  if (payload.action === "finalize-upload") {
    if (!validUuid(payload.id)) {
      return NextResponse.json({ error: "Invalid marketing media upload" }, { status: 400 });
    }

    const id = payload.id;
    const pendingPath = `pending/${id}.json`;
    const cleanupPath = pendingCleanupPath(id);
    if (await contentObjectExists(cleanupPath)) {
      return NextResponse.json({ error: "Prepared marketing media upload has expired" }, { status: 409 });
    }

    const asset = await readAssetMetadata(pendingPath);
    if (!asset || asset.id !== id) {
      return NextResponse.json({ error: "Prepared marketing media upload was not found" }, { status: 404 });
    }

    const admin = createAdminSupabase();
    const lastSlash = asset.storagePath.lastIndexOf("/");
    const directory = asset.storagePath.slice(0, lastSlash);
    const objectName = asset.storagePath.slice(lastSlash + 1);
    const { data: objects, error: listError } = await admin.storage
      .from(MARKETING_MEDIA_BUCKET)
      .list(directory, { limit: 10, search: objectName });
    if (listError) {
      console.error("ops marketing media verification failed", listError);
      return NextResponse.json({ error: "Unable to verify uploaded media" }, { status: 500 });
    }
    const stored = (objects ?? []).find((item) => item.name === objectName);
    if (!stored) {
      return NextResponse.json({ error: "Upload has not completed yet" }, { status: 409 });
    }

    const metadata = (stored.metadata ?? {}) as Record<string, unknown>;
    const storedSize = Number(metadata.size ?? 0);
    const storedMime = String(metadata.mimetype ?? metadata.contentType ?? "");
    if (storedSize <= 0 || storedSize > MAX_MEDIA_BYTES || (storedMime && storedMime !== asset.contentType)) {
      await admin.storage.from(MARKETING_MEDIA_BUCKET).remove([asset.storagePath]);
      await admin.storage.from(MARKETING_MEDIA_CONTENT_BUCKET).remove([pendingPath]);
      return NextResponse.json({ error: "Uploaded media did not match the prepared file" }, { status: 400 });
    }

    if (await contentObjectExists(cleanupPath)) {
      return NextResponse.json({ error: "Prepared marketing media upload has expired" }, { status: 409 });
    }

    const metadataBody = Buffer.from(`${JSON.stringify(asset, null, 2)}\n`, "utf8");
    const { error: metadataError } = await admin.storage
      .from(MARKETING_MEDIA_CONTENT_BUCKET)
      .upload(`assets/${id}.json`, metadataBody, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: false,
      });
    if (metadataError) {
      console.error("ops marketing media metadata write failed", metadataError);
      return NextResponse.json({ error: "Unable to save marketing media metadata" }, { status: 500 });
    }

    if (await contentObjectExists(cleanupPath)) {
      await removeContentObject(`assets/${id}.json`);
      return NextResponse.json({ error: "Prepared marketing media upload expired during finalization" }, { status: 409 });
    }

    await removePendingMarker(pendingPath, id);
    return NextResponse.json({ asset });
  }

  return NextResponse.json({ error: "Unknown marketing media action" }, { status: 400 });
}
