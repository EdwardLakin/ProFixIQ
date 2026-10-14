import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  MARKETING_MEDIA_BUCKET,
  MARKETING_MEDIA_CONTENT_BUCKET,
} from "@/features/marketing/media/server";
import {
  MarketingMediaAssetSchema,
  type MarketingMediaAsset,
} from "@/features/marketing/media/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const MEDIA_TYPES: Record<string, { extension: string; kind: "image" | "video" }> = {
  "image/jpeg": { extension: "jpg", kind: "image" },
  "image/png": { extension: "png", kind: "image" },
  "image/webp": { extension: "webp", kind: "image" },
  "image/avif": { extension: "avif", kind: "image" },
  "video/mp4": { extension: "mp4", kind: "video" },
  "video/webm": { extension: "webm", kind: "video" },
};

async function listAssets(): Promise<MarketingMediaAsset[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(MARKETING_MEDIA_CONTENT_BUCKET)
    .list("assets", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) throw new Error(error.message);

  const assets = await Promise.all(
    (data ?? [])
      .filter((item) => item.name.endsWith(".json"))
      .map(async (item) => {
        const { data: body, error: readError } = await admin.storage
          .from(MARKETING_MEDIA_CONTENT_BUCKET)
          .download(`assets/${item.name}`);
        if (readError || !body) return null;
        try {
          const parsed = MarketingMediaAssetSchema.safeParse(JSON.parse(await body.text()));
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      }),
  );

  return assets
    .filter((asset): asset is MarketingMediaAsset => Boolean(asset))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function GET() {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  try {
    return NextResponse.json({ assets: await listAssets() });
  } catch (error) {
    console.error("ops marketing media listing failed", error);
    return NextResponse.json({ error: "Unable to load marketing media" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const alt = String(form?.get("alt") ?? "").trim();
  const caption = String(form?.get("caption") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a screenshot or reel to upload" }, { status: 400 });
  }
  if (!alt) {
    return NextResponse.json({ error: "Alt text is required before upload" }, { status: 400 });
  }
  if (alt.length > 240 || caption.length > 300) {
    return NextResponse.json({ error: "Alt text or caption is too long" }, { status: 400 });
  }

  const mediaType = MEDIA_TYPES[file.type];
  if (!mediaType) {
    return NextResponse.json(
      { error: "Use JPG, PNG, WebP, AVIF, MP4, or WebM media" },
      { status: 400 },
    );
  }
  if (file.size <= 0 || file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: "Marketing media must be larger than 0 bytes and no more than 50 MB" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const storagePath = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${mediaType.extension}`;
  const admin = createAdminSupabase();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(MARKETING_MEDIA_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    console.error("ops marketing media upload failed", uploadError);
    return NextResponse.json({ error: "Unable to upload marketing media" }, { status: 500 });
  }

  const { data } = admin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(storagePath);
  if (!data.publicUrl) {
    await admin.storage.from(MARKETING_MEDIA_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "Unable to create marketing media URL" }, { status: 500 });
  }

  const asset = MarketingMediaAssetSchema.parse({
    id,
    kind: mediaType.kind,
    url: data.publicUrl,
    storagePath,
    filename: file.name || `marketing-media.${mediaType.extension}`,
    contentType: file.type,
    alt,
    caption: caption || null,
    createdAt: now.toISOString(),
  });
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
    await admin.storage.from(MARKETING_MEDIA_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "Unable to save marketing media metadata" }, { status: 500 });
  }

  return NextResponse.json({ asset });
}
