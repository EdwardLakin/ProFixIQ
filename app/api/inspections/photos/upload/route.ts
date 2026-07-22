import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import crypto from "crypto";
import { buildInspectionMediaCapturedEvent } from "@/features/integrations/shopreel/server/buildProFixIQStoryEvents";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

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
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  inspectionId: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
  userId: string;
}): Promise<{ shopId: string | null; source: string }> {
  const { supabase, inspectionId, workOrderId, workOrderLineId, userId } = args;

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
    console.error("[inspections/photos/upload] inspections lookup failed", inspErr);
  }

  if (insp?.shop_id) {
    return { shopId: insp.shop_id, source: "inspections.shop_id" };
  }

  const woId = insp?.work_order_id ?? workOrderId ?? null;
  const wolId = insp?.work_order_line_id ?? workOrderLineId ?? null;

  if (wolId) {
    const { data, error } = await supabase
      .from("work_order_lines")
      .select("id, work_orders:work_order_id ( shop_id )")
      .eq("id", wolId)
      .maybeSingle<{ id: string; work_orders: { shop_id: string | null } | null }>();

    if (error) {
      console.error("[inspections/photos/upload] wol->wo lookup failed", error);
    } else {
      const shopId = data?.work_orders?.shop_id ?? null;
      if (shopId) {
        return { shopId, source: "work_order_lines.work_order_id.shop_id" };
      }
    }
  }

  if (woId) {
    const { data, error } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", woId)
      .maybeSingle<{ id: string; shop_id: string | null; vehicle_id: string | null }>();

    if (error) {
      console.error("[inspections/photos/upload] wo lookup failed", error);
    } else {
      const shopId = data?.shop_id ?? null;
      if (shopId) {
        return { shopId, source: "work_orders.shop_id" };
      }
    }
  }

  const { data: profById } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle<{ shop_id: string | null }>();

  if (profById?.shop_id) {
    return { shopId: profById.shop_id, source: "profiles.id.shop_id" };
  }

  const { data: profByUserId } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", userId)
    .maybeSingle<{ shop_id: string | null }>();

  if (profByUserId?.shop_id) {
    return { shopId: profByUserId.shop_id, source: "profiles.user_id.shop_id" };
  }

  return { shopId: null, source: "none" };
}

async function ensureInspectionRow(args: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  inspectionId: string;
  shopId: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
}): Promise<
  | { ok: true; inspectionId: string }
  | { ok: false; error: string }
> {
  const { supabase, inspectionId, shopId, workOrderId, workOrderLineId } = args;

  // The work-order line is the canonical inspection identity. Installed PWAs
  // may replay an older device-local inspection UUID after the canonical row
  // has advanced, so resolve by line before trusting the client UUID.
  if (workOrderLineId) {
    const { data: existingByLine, error: existingByLineErr } = await supabase
      .from("inspections")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_line_id", workOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingByLineErr) {
      console.error(
        "[inspections/photos/upload] canonical inspection lookup failed",
        existingByLineErr,
      );
      return { ok: false, error: existingByLineErr.message };
    }

    if (existingByLine?.id) {
      return { ok: true, inspectionId: existingByLine.id };
    }
  }

  // Legacy standalone inspections do not have a work-order line. Keep their
  // UUID fallback shop-scoped, but never let it override a supplied line.
  const { data: existingById, error: existingByIdErr } = await supabase
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq("shop_id", shopId)
    .maybeSingle<{ id: string }>();

  if (existingByIdErr) {
    console.error(
      "[inspections/photos/upload] inspection exists check by id failed",
      existingByIdErr,
    );
    return { ok: false, error: existingByIdErr.message };
  }

  if (existingById?.id) {
    return { ok: true, inspectionId: existingById.id };
  }

  let vehicleId: string | null = null;

  if (workOrderId) {
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle<{ id: string; vehicle_id: string | null }>();

    if (woErr) {
      console.error("[inspections/photos/upload] work order vehicle lookup failed", woErr);
    }

    vehicleId = wo?.vehicle_id ?? null;
  }

  const insertPayload: Database["public"]["Tables"]["inspections"]["Insert"] = {
    id: inspectionId,
    shop_id: shopId,
    work_order_id: workOrderId,
    work_order_line_id: workOrderLineId,
    vehicle_id: vehicleId,
    status: "in_progress",
  };

  const { error: insertErr } = await supabase
    .from("inspections")
    .insert(insertPayload);

  if (insertErr) {
    console.error("[inspections/photos/upload] inspection bootstrap insert failed", insertErr);
    return { ok: false, error: insertErr.message };
  }

  return { ok: true, inspectionId };
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const requestedInspectionId = asString(form.get("inspectionId"));
  const workOrderId = asString(form.get("workOrderId"));
  const workOrderLineId = asString(form.get("workOrderLineId"));
  const itemName = asString(form.get("itemName"));
  const notes = asString(form.get("notes"));
  const file = form.get("file");

  if (!requestedInspectionId) {
    return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.toLowerCase().startsWith("image/")) {
    return NextResponse.json(
      { error: "Inspection evidence must be an image." },
      { status: 415 },
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "Inspection photos must be 15 MB or smaller." },
      { status: 413 },
    );
  }

  const resolved = await resolveShopId({
    supabase,
    inspectionId: requestedInspectionId,
    workOrderId,
    workOrderLineId,
    userId: user.id,
  });

  const shopId = resolved.shopId;
  if (!shopId) {
    return NextResponse.json(
      {
        error: "Unable to resolve shop for inspection photo upload",
        debug: {
          source: resolved.source,
          inspectionId: requestedInspectionId,
          workOrderId,
          workOrderLineId,
        },
      },
      { status: 400 },
    );
  }

  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });

  if (ctxErr) {
    console.error("[inspections/photos/upload] set_current_shop_id failed", ctxErr);
    return NextResponse.json(
      { error: "Failed to set shop context" },
      { status: 500 },
    );
  }

  const ensure = await ensureInspectionRow({
    supabase,
    inspectionId: requestedInspectionId,
    shopId,
    workOrderId,
    workOrderLineId,
  });

  if (!ensure.ok) {
    return NextResponse.json(
      { error: `Failed to bootstrap inspection row: ${ensure.error}` },
      { status: 500 },
    );
  }

  const resolvedInspectionId = ensure.inspectionId;

  const bucket = "inspection_photos";
  const shopPart = safeFilePart(shopId);
  const inspPart = safeFilePart(resolvedInspectionId);
  const idPart = crypto.randomUUID();
  const ext = extFromMime(file.type);

  const path = `shops/${shopPart}/inspections/${inspPart}/${idPart}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type || (ext === "png" ? "image/png" : "image/jpeg"),
    upsert: false,
  });

  if (upErr) {
    console.error("[inspections/photos/upload] storage upload failed", upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signErr || !signed?.signedUrl) {
    console.warn("[inspections/photos/upload] createSignedUrl failed", signErr);
  }

  const imageUrl = signed?.signedUrl ?? null;

  const { data: row, error: insErr } = await supabase
    .from("inspection_photos")
    .insert({
      inspection_id: resolvedInspectionId,
      item_name: itemName,
      image_url: imageUrl ?? path,
      notes: notes ?? null,
      user_id: user.id,
    })
    .select("id, image_url, item_name")
    .single();

  if (insErr) {
    console.error("[inspections/photos/upload] inspection_photos insert failed", insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
    // Best-effort ShopReel media sync
    try {
      const mediaUrl = row?.image_url ?? imageUrl ?? path ?? null;

      if (shopId && mediaUrl) {
        const mediaEvent = await buildInspectionMediaCapturedEvent({
          shopId,
          inspectionId: resolvedInspectionId,
          workOrderId,
          itemName,
          notes,
          mediaUrl,
        });

        await postStoryEventToShopReel(mediaEvent).catch((error: unknown) => {
          console.error("[shopreel] failed to sync inspection media", error);
        });
      }
    } catch (error) {
      console.error("[shopreel] inspection media event error", error);
    }

  return NextResponse.json({
    ok: true,
    bucket,
    path,
    inspectionId: resolvedInspectionId,
    requestedInspectionId,
    workOrderId,
    workOrderLineId,
    itemName,
    url: row?.image_url ?? imageUrl,
    photo: row,
  });
}
