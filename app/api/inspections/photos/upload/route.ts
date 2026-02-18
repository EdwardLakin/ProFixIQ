import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import crypto from "crypto";

type DB = Database;

function asString(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function safeFilePart(x: string): string {
  return x.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extFromMime(mime: string | null): "jpg" | "png" {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("png")) return "png";
  return "jpg";
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // parse multipart
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const inspectionId = asString(form.get("inspectionId"));
  const itemName = asString(form.get("itemName"));
  const notes = asString(form.get("notes"));
  const file = form.get("file");

  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  // resolve shop_id for policy + path
  const { data: insp, error: inspErr } = await supabase
    .from("inspections")
    .select("id, shop_id")
    .eq("id", inspectionId)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (inspErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/photos/upload] inspections lookup failed", inspErr);
    return NextResponse.json({ error: "Failed to load inspection" }, { status: 500 });
  }

  const shopId = insp?.shop_id ?? null;
  if (!shopId) {
    return NextResponse.json({ error: "Inspection missing shop_id" }, { status: 400 });
  }

  // ensure storage policy that depends on current_shop_id() can evaluate
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
  if (ctxErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/photos/upload] set_current_shop_id failed", ctxErr);
    return NextResponse.json({ error: "Failed to set shop context" }, { status: 500 });
  }

  // build storage path
  const bucket = "inspection_photos";
  const shopPart = safeFilePart(shopId);
  const inspPart = safeFilePart(inspectionId);
  const idPart = crypto.randomUUID();
  const ext = extFromMime(file.type);

  const path = `shops/${shopPart}/inspections/${inspPart}/${idPart}.${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: file.type || (ext === "png" ? "image/png" : "image/jpeg"), upsert: false });

  if (upErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/photos/upload] storage upload failed", upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // signed url for UI/PDF (30 days)
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signErr || !signed?.signedUrl) {
    // eslint-disable-next-line no-console
    console.warn("[inspections/photos/upload] createSignedUrl failed", signErr);
  }

  const imageUrl = signed?.signedUrl ?? null;

  // insert row in inspection_photos (you currently only have image_url column)
  const { data: row, error: insErr } = await supabase
    .from("inspection_photos")
    .insert({
      inspection_id: inspectionId,
      item_name: itemName,
      image_url: imageUrl ?? path, // fallback: store path if signed url missing
      notes: notes ?? null,
      user_id: user.id,
    })
    .select("id, image_url, item_name")
    .single();

  if (insErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/photos/upload] inspection_photos insert failed", insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    bucket,
    path,
    inspectionId,
    itemName,
    url: row?.image_url ?? imageUrl,
    photo: row,
  });
}