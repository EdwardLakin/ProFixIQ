export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const BUCKET = "work_order_media";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

type WorkOrderMediaInsert = Database["public"]["Tables"]["work_order_media"]["Insert"] & {
  work_order_line_id?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  content_type?: string | null;
  file_size?: number | null;
  note?: string | null;
  source?: string | null;
};

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "assistant-photo";
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const note = typeof form.get("note") === "string" ? String(form.get("note")).trim().slice(0, 500) : "";
  const workOrderLineId = typeof form.get("workOrderLineId") === "string" ? String(form.get("workOrderLineId")) : "";
  const explicitWorkOrderId = typeof form.get("workOrderId") === "string" ? String(form.get("workOrderId")) : "";

  if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image must be 6 MB or smaller." }, { status: 413 });

  let workOrderId = explicitWorkOrderId || null;
  if (workOrderLineId) {
    const { data: line, error } = await access.supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id")
      .eq("id", workOrderLineId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Failed to resolve work order line." }, { status: 500 });
    if (!line?.work_order_id) return NextResponse.json({ error: "Work order line not found." }, { status: 404 });
    workOrderId = line.work_order_id;
  }

  if (!workOrderId) return NextResponse.json({ error: "Missing work order context." }, { status: 400 });

  const { data: wo, error: woErr } = await access.supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", workOrderId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (woErr) return NextResponse.json({ error: "Failed to verify work order." }, { status: 500 });
  if (!wo) return NextResponse.json({ error: "Work order not found." }, { status: 404 });

  const safeName = sanitizeName(file.name);
  const storagePath = `${shopId}/${workOrderId}/ai-assistant/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error: uploadErr } = await access.supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const publicUrl = access.supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  const row: WorkOrderMediaInsert = {
    shop_id: shopId,
    work_order_id: workOrderId as string,
    work_order_line_id: workOrderLineId || null,
    user_id: access.profile.id,
    url: publicUrl,
    kind: "photo",
    storage_bucket: BUCKET,
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type,
    file_size: file.size,
    note: note || null,
    source: "ai_assistant",
  };

  const { data: media, error: insertErr } = await access.supabase
    .from("work_order_media")
    .insert(row as Database["public"]["Tables"]["work_order_media"]["Insert"])
    .select("id, url")
    .single();
  if (insertErr) {
    await access.supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
    return NextResponse.json({ error: `Failed to save evidence: ${insertErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    attachment: {
      id: media.id,
      url: media.url ?? publicUrl,
      storageBucket: BUCKET,
      storagePath,
      fileName: file.name,
      contentType: file.type,
      note: note || null,
      workOrderId,
      workOrderLineId: workOrderLineId || null,
    },
  });
}
