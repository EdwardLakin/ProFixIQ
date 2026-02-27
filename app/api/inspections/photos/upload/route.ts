// /app/api/inspections/photos/upload/route.ts (FULL FILE REPLACEMENT)
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

async function resolveShopId(args: {
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>;
  inspectionId: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
  userId: string;
}): Promise<{ shopId: string | null; source: string }> {
  const { supabase, inspectionId, workOrderId, workOrderLineId, userId } = args;

  // 1) inspections.shop_id
  const { data: insp, error: inspErr } = await supabase
    .from("inspections")
    .select("id, shop_id, work_order_id, work_order_line_id")
    .eq("id", inspectionId)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      work_order_id: string | null;
      work_order_line_id: string | null;
    }>();

  if (inspErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/photos/upload] inspections lookup failed", inspErr);
  }

  if (insp?.shop_id) return { shopId: insp.shop_id, source: "inspections.shop_id" };

  // Prefer values from inspection row if present
  const woId = insp?.work_order_id ?? workOrderId ?? null;
  const wolId = insp?.work_order_line_id ?? workOrderLineId ?? null;

  // 2) work order line -> work order -> shop
  if (wolId) {
    const { data, error } = await supabase
      .from("work_order_lines")
      .select("id, work_orders:work_order_id ( shop_id )")
      .eq("id", wolId)
      .maybeSingle<{ id: string; work_orders: { shop_id: string | null } | null }>();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[inspections/photos/upload] wol->wo lookup failed", error);
    } else {
      const shopId = data?.work_orders?.shop_id ?? null;
      if (shopId) return { shopId, source: "work_order_lines.work_order_id.shop_id" };
    }
  }

  // 3) work order -> shop
  if (woId) {
    const { data, error } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", woId)
      .maybeSingle<{ id: string; shop_id: string | null }>();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[inspections/photos/upload] wo lookup failed", error);
    } else {
      const shopId = data?.shop_id ?? null;
      if (shopId) return { shopId, source: "work_orders.shop_id" };
    }
  }

  // 4) fallback: profiles.shop_id (support both id and user_id shapes)
  const { data: profById } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle<{ shop_id: string | null }>();
  if (profById?.shop_id) return { shopId: profById.shop_id, source: "profiles.id.shop_id" };

  const { data: profByUserId } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", userId)
    .maybeSingle<{ shop_id: string | null }>();
  if (profByUserId?.shop_id) return { shopId: profByUserId.shop_id, source: "profiles.user_id.shop_id" };

  return { shopId: null, source: "none" };
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
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const inspectionId = asString(form.get("inspectionId"));
  const workOrderId = asString(form.get("workOrderId"));
  const workOrderLineId = asString(form.get("workOrderLineId"));

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
  const resolved = await resolveShopId({
    supabase,
    inspectionId,
    workOrderId,
    workOrderLineId,
    userId: user.id,
  });

  const shopId = resolved.shopId;
  if (!shopId) {
    return NextResponse.json(
      {
        error: "Inspection missing shop_id",
        hint:
          "Include workOrderId or workOrderLineId in the upload form-data, or ensure the inspection/work order is linked and has shop_id.",
        debug: { source: resolved.source, inspectionId, workOrderId, workOrderLineId },
      },
      { status: 400 },
    );
  }

  // best-effort: backfill inspections.shop_id (ignore failure if RLS blocks it)
  try {
    await supabase
      .from("inspections")
      .update({ shop_id: shopId })
      .eq("id", inspectionId)
      .is("shop_id", null);
  } catch {
    // ignore
  }

  // ensure storage policy that depends on current_shop_id() can evaluate
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });
  if (ctxErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/photos/upload] set_current_shop_id failed", ctxErr);
    return NextResponse.json(
      { error: "Failed to set shop context" },
      { status: 500 },
    );
  }

  // build storage path
  const bucket = "inspection_photos";
  const shopPart = safeFilePart(shopId);
  const inspPart = safeFilePart(inspectionId);
  const idPart = crypto.randomUUID();
  const ext = extFromMime(file.type);

  const path = `shops/${shopPart}/inspections/${inspPart}/${idPart}.${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type || (ext === "png" ? "image/png" : "image/jpeg"),
    upsert: false,
  });

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

  const { data: row, error: insErr } = await supabase
    .from("inspection_photos")
    .insert({
      inspection_id: inspectionId,
      item_name: itemName,
      image_url: imageUrl ?? path,
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
    workOrderId,
    workOrderLineId,
    itemName,
    url: row?.image_url ?? imageUrl,
    photo: row,
  });
}