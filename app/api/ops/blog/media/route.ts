import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { BLOG_MEDIA_BUCKET } from "@/features/marketing/blog/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image to upload" }, { status: 400 });
  }

  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Use a JPG, PNG, WebP, or GIF image" },
      { status: 400 },
    );
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Images must be larger than 0 bytes and no more than 10 MB" },
      { status: 400 },
    );
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const storagePath = `articles/${year}/${month}/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminSupabase();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(BLOG_MEDIA_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    console.error("ops blog media upload failed", uploadError);
    return NextResponse.json({ error: "Unable to upload image" }, { status: 500 });
  }

  const { data } = admin.storage.from(BLOG_MEDIA_BUCKET).getPublicUrl(storagePath);
  if (!data.publicUrl) {
    await admin.storage.from(BLOG_MEDIA_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "Unable to create image URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.publicUrl, path: storagePath });
}
