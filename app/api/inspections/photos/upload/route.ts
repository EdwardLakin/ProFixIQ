import "server-only";

export const runtime = "nodejs";

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { authorizeInspectionMutation } from "@/features/inspections/server/authorizeInspectionMutation";
import { inspectionPhotoStorageObject } from "@/features/inspections/server/reconcileInspectionPhotoEvidence";
import { canExecuteInspectionForProduct } from "@/features/inspections/server/inspectionExecutionProductAccess";
import { buildInspectionMediaCapturedEvent } from "@/features/integrations/shopreel/server/buildProFixIQStoryEvents";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

type CanonicalInspectionRow = {
  id: string;
  shop_id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
};

type InspectionPhotoRow = {
  id: string;
  image_url: string;
  item_name: string | null;
};

type WorkOrderInspectionPhotoSaveResult = {
  photo: InspectionPhotoRow;
  inserted: boolean;
};

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function extensionForMime(mime: string): "jpg" | "png" {
  return mime.toLowerCase().includes("png") ? "png" : "jpg";
}

function mutationId(operationKey: string): string {
  return `ip-${crypto.createHash("sha256").update(operationKey).digest("hex").slice(0, 40)}`;
}

function isStorageAuthorizationError(error: {
  message?: string;
  statusCode?: string | number;
}): boolean {
  return (
    String(error.statusCode ?? "") === "403" ||
    /row-level security|not authorized|permission denied/i.test(
      error.message ?? "",
    )
  );
}

function asWorkOrderInspectionPhotoSaveResult(
  value: unknown,
): WorkOrderInspectionPhotoSaveResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as {
    photo?: Partial<InspectionPhotoRow>;
    inserted?: unknown;
  };
  if (
    !candidate.photo ||
    typeof candidate.photo.id !== "string" ||
    typeof candidate.photo.image_url !== "string"
  ) {
    return null;
  }
  return {
    photo: {
      id: candidate.photo.id,
      image_url: candidate.photo.image_url,
      item_name:
        typeof candidate.photo.item_name === "string"
          ? candidate.photo.item_name
          : null,
    },
    inserted: candidate.inserted === true,
  };
}

async function resolveActorShop(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  userId: string,
): Promise<string | null> {
  let profile = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle<{ shop_id: string | null }>();
  if (!profile.data && !profile.error) {
    profile = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle<{ shop_id: string | null }>();
  }
  return profile.data?.shop_id ?? null;
}

async function resolveCanonicalInspection(args: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  shopId: string;
  inspectionId: string;
  workOrderLineId: string | null;
}): Promise<CanonicalInspectionRow | null> {
  const columns = "id,shop_id,work_order_id,work_order_line_id";
  if (args.workOrderLineId) {
    const { data, error } = await args.supabase
      .from("inspections")
      .select(columns)
      .eq("shop_id", args.shopId)
      .eq("work_order_line_id", args.workOrderLineId)
      .eq("is_canonical", true)
      .maybeSingle<CanonicalInspectionRow>();
    if (error) {
      console.error(
        "[inspections/photos/upload] canonical inspection lookup failed",
        error,
      );
      return null;
    }
    return data;
  }

  const { data, error } = await args.supabase
    .from("inspections")
    .select(columns)
    .eq("id", args.inspectionId)
    .eq("shop_id", args.shopId)
    .eq("is_canonical", true)
    .maybeSingle<CanonicalInspectionRow>();
  if (error) {
    console.error(
      "[inspections/photos/upload] inspection lookup failed",
      error,
    );
    return null;
  }
  return data;
}

async function findInspectionPhotoForObject(args: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  inspectionId: string;
  bucket: "job-photos" | "inspection_photos";
  path: string;
}): Promise<InspectionPhotoRow | null> {
  const { data, error } = await args.supabase
    .from("inspection_photos")
    .select("id,image_url,item_name")
    .eq("inspection_id", args.inspectionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(
      "[inspections/photos/upload] existing photo lookup failed",
      error,
    );
    return null;
  }
  return (
    ((data ?? []) as InspectionPhotoRow[]).find((row) => {
      const object = inspectionPhotoStorageObject(row.image_url);
      return object?.bucket === args.bucket && object.path === args.path;
    }) ?? null
  );
}

async function ensureInspectionPhotoRow(args: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  inspectionId: string;
  bucket: "job-photos" | "inspection_photos";
  path: string;
  signedUrl: string;
  itemName: string | null;
  notes: string | null;
  userId: string;
}): Promise<{
  row: InspectionPhotoRow | null;
  inserted: boolean;
  error?: string;
}> {
  const existing = await findInspectionPhotoForObject(args);
  if (existing) {
    if (existing.image_url !== args.signedUrl) {
      const { error } = await args.supabase
        .from("inspection_photos")
        .update({ image_url: args.signedUrl })
        .eq("id", existing.id)
        .eq("inspection_id", args.inspectionId);
      if (error) {
        return { row: null, inserted: false, error: error.message };
      }
    }
    return {
      row: { ...existing, image_url: args.signedUrl },
      inserted: false,
    };
  }

  const { data, error } = await args.supabase
    .from("inspection_photos")
    .insert({
      inspection_id: args.inspectionId,
      item_name: args.itemName,
      image_url: args.signedUrl,
      notes: args.notes,
      user_id: args.userId,
    })
    .select("id,image_url,item_name")
    .single<InspectionPhotoRow>();
  return error
    ? { row: null, inserted: false, error: error.message }
    : { row: data, inserted: true };
}

async function compensateWorkOrderPhotoUpload(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  workOrderId: string;
  workOrderLineId: string;
  path: string;
  clientMutationId: string;
}): Promise<boolean> {
  const { error: storageError } = await args.admin.storage
    .from("job-photos")
    .remove([args.path]);
  if (storageError) {
    console.error(
      "[inspections/photos/upload] failed to compensate unattached object",
      storageError,
    );
    return false;
  }
  const { error: mediaError } = await args.admin
    .from("work_order_media")
    .delete()
    .eq("shop_id", args.shopId)
    .eq("work_order_id", args.workOrderId)
    .eq("work_order_line_id", args.workOrderLineId)
    .eq("storage_bucket", "job-photos")
    .eq("storage_path", args.path)
    .eq("client_mutation_id", args.clientMutationId);
  if (mediaError) {
    console.error(
      "[inspections/photos/upload] failed to compensate unattached media",
      mediaError,
    );
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const requestedInspectionId = asString(form.get("inspectionId"));
  const requestedWorkOrderId = asString(form.get("workOrderId"));
  const requestedLineId = asString(form.get("workOrderLineId"));
  const itemName = asString(form.get("itemName"));
  const notes = asString(form.get("notes"));
  const file = form.get("file");
  if (!requestedInspectionId) {
    return NextResponse.json(
      { error: "Missing inspectionId" },
      { status: 400 },
    );
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

  const suppliedOperationKey = request.headers.get("Idempotency-Key")?.trim();
  if (suppliedOperationKey && suppliedOperationKey.length > 200) {
    return NextResponse.json(
      { error: "Idempotency-Key must be 200 characters or fewer." },
      { status: 400 },
    );
  }
  const operationKey = suppliedOperationKey || crypto.randomUUID();

  const shopId = await resolveActorShop(supabase, user.id);
  if (!shopId) {
    return NextResponse.json(
      { error: "Unable to resolve actor shop." },
      { status: 403 },
    );
  }
  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });
  if (contextError) {
    return NextResponse.json(
      { error: "Unable to set shop context." },
      { status: 500 },
    );
  }

  const inspection = await resolveCanonicalInspection({
    supabase,
    shopId,
    inspectionId: requestedInspectionId,
    workOrderLineId: requestedLineId,
  });
  if (!inspection) {
    return NextResponse.json(
      {
        error:
          "Inspection progress must reach the canonical server record before photos can upload.",
        retryable: true,
      },
      { status: 409 },
    );
  }

  const workOrderId = inspection.work_order_id;
  const workOrderLineId = inspection.work_order_line_id;
  if (
    (requestedWorkOrderId && requestedWorkOrderId !== workOrderId) ||
    (requestedLineId && requestedLineId !== workOrderLineId)
  ) {
    return NextResponse.json(
      { error: "Inspection work-order scope does not match." },
      { status: 403 },
    );
  }
  if (
    !(await canExecuteInspectionForProduct({
      supabase,
      shopId,
      workOrderId,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Keep service access for stable receipt lookups, standalone legacy uploads,
  // and signed previews. Work Order evidence itself is written through the
  // authenticated client so Storage RLS and the atomic receipt RPC revalidate
  // capability and exact-line assignment at each durable boundary.
  const admin = createAdminSupabase();

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const clientMutationId = mutationId(operationKey);
  const extension = extensionForMime(file.type);
  const contentType =
    file.type || (extension === "png" ? "image/png" : "image/jpeg");

  const bucket: "job-photos" | "inspection_photos" =
    workOrderId && workOrderLineId ? "job-photos" : "inspection_photos";
  const path =
    bucket === "job-photos" && workOrderId && workOrderLineId
      ? `wo/${workOrderId}/lines/${workOrderLineId}/${clientMutationId}_${contentHash.slice(0, 32)}.${extension}`
      : `shops/${shopId}/inspections/${inspection.id}/${clientMutationId}_${contentHash.slice(0, 32)}.${extension}`;

  const authorization = await authorizeInspectionMutation({
    sessionClient: supabase,
    shopId,
    workOrderId,
    workOrderLineId,
    committedPhotoReplay:
      bucket === "job-photos" && workOrderId && workOrderLineId
        ? {
            inspectionId: inspection.id,
            storageBucket: bucket,
            storagePath: path,
            clientMutationId,
          }
        : undefined,
  });
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  let idempotent = false;
  let uploadedThisRequest = false;

  if (workOrderId && workOrderLineId) {
    const { data: existingMedia, error: existingMediaError } = await admin
      .from("work_order_media")
      .select("id,work_order_id,work_order_line_id,storage_bucket,storage_path")
      .eq("shop_id", shopId)
      .eq("client_mutation_id", clientMutationId)
      .maybeSingle<{
        id: string;
        work_order_id: string;
        work_order_line_id: string | null;
        storage_bucket: string | null;
        storage_path: string | null;
      }>();
    if (existingMediaError) {
      return NextResponse.json(
        { error: "Unable to verify the upload operation." },
        { status: 500 },
      );
    }
    if (existingMedia) {
      if (
        existingMedia.work_order_id !== workOrderId ||
        existingMedia.work_order_line_id !== workOrderLineId ||
        existingMedia.storage_bucket !== bucket ||
        existingMedia.storage_path !== path
      ) {
        return NextResponse.json(
          {
            error:
              "This upload operation was already used for different photo bytes.",
          },
          { status: 409 },
        );
      }
      idempotent = true;
    }
  } else {
    // Preserve legacy standalone inspections while keeping their retries stable.
    const existingPhoto = await findInspectionPhotoForObject({
      supabase: admin,
      inspectionId: inspection.id,
      bucket,
      path,
    });
    idempotent = Boolean(existingPhoto);
  }

  if (!idempotent) {
    const uploadStorage =
      bucket === "job-photos" ? supabase.storage : admin.storage;
    const { error: uploadError } = await uploadStorage
      .from(bucket)
      .upload(path, bytes, { contentType, upsert: false });
    if (uploadError) {
      if (bucket === "job-photos") {
        if (isStorageAuthorizationError(uploadError)) {
          return NextResponse.json(
            {
              error:
                "Inspection photo access changed before the upload completed.",
            },
            { status: 403 },
          );
        }
        const { data: raced } = await admin
          .from("work_order_media")
          .select("id,storage_path")
          .eq("shop_id", shopId)
          .eq("client_mutation_id", clientMutationId)
          .maybeSingle<{ id: string; storage_path: string | null }>();
        if (raced?.storage_path === path) {
          idempotent = true;
        } else if (raced?.id) {
          return NextResponse.json(
            {
              error:
                "This upload operation was already used for different photo bytes.",
            },
            { status: 409 },
          );
        } else {
          return NextResponse.json(
            { error: "Unable to store inspection photo." },
            { status: 500 },
          );
        }
      } else {
        return NextResponse.json(
          { error: "Unable to store inspection photo." },
          { status: 500 },
        );
      }
    } else if (bucket === "job-photos") {
      uploadedThisRequest = true;
    }
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Unable to create inspection photo preview." },
      { status: 500 },
    );
  }

  let saved: {
    row: InspectionPhotoRow | null;
    inserted: boolean;
    error?: string;
  };
  if (authorization.replay.kind === "photo") {
    saved = {
      row: {
        ...authorization.replay.photo,
        image_url: signed.signedUrl,
      },
      inserted: false,
    };
    idempotent = true;
  } else if (bucket === "job-photos" && workOrderId && workOrderLineId) {
    const { data: savedData, error: savedError } = await supabase.rpc(
      "save_work_order_inspection_photo_evidence_atomic",
      {
        p_inspection_id: inspection.id,
        p_shop_id: shopId,
        p_work_order_id: workOrderId,
        p_work_order_line_id: workOrderLineId,
        p_storage_bucket: "job-photos",
        p_storage_path: path,
        p_item_name: itemName ?? "",
        p_notes: notes ?? "",
      },
    );
    if (savedError) {
      console.error(
        "[inspections/photos/upload] atomic Work Order photo link failed",
        savedError,
      );
      if (savedError.code === "42501") {
        const compensated =
          !uploadedThisRequest ||
          (await compensateWorkOrderPhotoUpload({
            admin,
            shopId,
            workOrderId,
            workOrderLineId,
            path,
            clientMutationId,
          }));
        return NextResponse.json(
          {
            error: compensated
              ? "Inspection photo access changed before the evidence was attached."
              : "Inspection photo access changed and upload cleanup failed. Contact support before retrying.",
          },
          { status: compensated ? 403 : 500 },
        );
      }
      if (savedError.code === "40001") {
        const compensated =
          !uploadedThisRequest ||
          (await compensateWorkOrderPhotoUpload({
            admin,
            shopId,
            workOrderId,
            workOrderLineId,
            path,
            clientMutationId,
          }));
        return NextResponse.json(
          {
            error: compensated
              ? "Inspection photo scope changed; retry the upload."
              : "Inspection photo scope changed and upload cleanup failed. Contact support before retrying.",
            retryable: compensated,
          },
          { status: compensated ? 409 : 500 },
        );
      }
    }
    const atomicResult = asWorkOrderInspectionPhotoSaveResult(savedData);
    saved = atomicResult
      ? {
          row: { ...atomicResult.photo, image_url: signed.signedUrl },
          inserted: atomicResult.inserted,
        }
      : {
          row: null,
          inserted: false,
          error: savedError?.message ?? "Invalid atomic photo receipt.",
        };
  } else {
    saved = await ensureInspectionPhotoRow({
      supabase: admin,
      inspectionId: inspection.id,
      bucket,
      path,
      signedUrl: signed.signedUrl,
      itemName,
      notes,
      userId: user.id,
    });
  }
  if (!saved.row) {
    console.error(
      "[inspections/photos/upload] inspection photo link failed",
      saved.error,
    );
    return NextResponse.json(
      { error: "Unable to attach the photo to the inspection." },
      { status: 500 },
    );
  }

  if (saved.inserted) {
    try {
      const mediaEvent = await buildInspectionMediaCapturedEvent({
        shopId,
        inspectionId: inspection.id,
        workOrderId,
        itemName,
        notes,
        mediaUrl: saved.row.image_url,
      });
      await postStoryEventToShopReel(mediaEvent).catch((error: unknown) => {
        console.error("[shopreel] failed to sync inspection media", error);
      });
    } catch (error) {
      console.error("[shopreel] inspection media event error", error);
    }
  }

  return NextResponse.json({
    ok: true,
    idempotent: idempotent || !saved.inserted,
    bucket,
    path,
    inspectionId: inspection.id,
    requestedInspectionId,
    workOrderId,
    workOrderLineId,
    itemName,
    url: saved.row.image_url,
    photo: saved.row,
  });
}
