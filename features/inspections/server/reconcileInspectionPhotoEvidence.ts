import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { authorizeInspectionMutation } from "@/features/inspections/server/authorizeInspectionMutation";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export type InspectionPhotoEvidenceRow = {
  id: string;
  inspection_id: string | null;
  image_url: string | null;
  user_id: string | null;
};

export type InspectionPhotoStorageObject = {
  bucket: "job-photos" | "inspection_photos";
  path: string;
};

function cleanSegments(path: string): string[] | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded.includes("\\")) return null;
  const segments = decoded.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }
  return segments;
}

export function inspectionPhotoStorageObject(
  value: string | null | undefined,
): InspectionPhotoStorageObject | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, "https://local.invalid");
    const match = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:sign|public|authenticated)\/(job-photos|inspection_photos)\/(.+)$/,
    );
    if (match && cleanSegments(match[2])) {
      return {
        bucket: match[1] as InspectionPhotoStorageObject["bucket"],
        path: decodeURIComponent(match[2]),
      };
    }
  } catch {
    return null;
  }

  const rawPath = trimmed.replace(/^\/+/, "");
  if (rawPath.startsWith("wo/") && cleanSegments(rawPath)) {
    return { bucket: "job-photos", path: rawPath };
  }
  if (rawPath.startsWith("shops/") && cleanSegments(rawPath)) {
    return { bucket: "inspection_photos", path: rawPath };
  }
  return null;
}

export function inspectionPhotoBelongsToScope(args: {
  object: InspectionPhotoStorageObject;
  shopId: string;
  workOrderId: string;
  workOrderLineId: string;
  inspectionIds: ReadonlySet<string>;
}): boolean {
  const segments = cleanSegments(args.object.path);
  if (!segments) return false;

  if (args.object.bucket === "job-photos") {
    return (
      segments.length === 5 &&
      segments[0] === "wo" &&
      segments[1] === args.workOrderId &&
      segments[2] === "lines" &&
      segments[3] === args.workOrderLineId
    );
  }

  return (
    segments.length === 5 &&
    segments[0] === "shops" &&
    segments[1] === args.shopId &&
    segments[2] === "inspections" &&
    args.inspectionIds.has(segments[3])
  );
}

export async function reconcileInspectionPhotoEvidence(args: {
  sessionClient: SupabaseClient<Database>;
  shopId: string;
  workOrderId: string;
  workOrderLineId: string;
  inspectionIds: string[];
  photos: InspectionPhotoEvidenceRow[];
}): Promise<{ linked: number; skipped: number }> {
  const authorization = await authorizeInspectionMutation({
    sessionClient: args.sessionClient,
    shopId: args.shopId,
    workOrderId: args.workOrderId,
    workOrderLineId: args.workOrderLineId,
  });
  if (!authorization.ok) {
    return { linked: 0, skipped: args.photos.length };
  }

  const admin = createAdminSupabase();
  const inspectionIds = new Set(args.inspectionIds);
  let linked = 0;
  let skipped = 0;

  for (const photo of args.photos) {
    if (!photo.inspection_id || !inspectionIds.has(photo.inspection_id)) {
      skipped += 1;
      continue;
    }
    const object = inspectionPhotoStorageObject(photo.image_url);
    if (
      !object ||
      !inspectionPhotoBelongsToScope({
        object,
        shopId: args.shopId,
        workOrderId: args.workOrderId,
        workOrderLineId: args.workOrderLineId,
        inspectionIds,
      })
    ) {
      skipped += 1;
      continue;
    }

    const { data: existing, error: existingError } = await admin
      .from("work_order_media")
      .select("id,shop_id,work_order_id,work_order_line_id")
      .eq("shop_id", args.shopId)
      .eq("storage_bucket", object.bucket)
      .eq("storage_path", object.path)
      .maybeSingle<{
        id: string;
        shop_id: string;
        work_order_id: string;
        work_order_line_id: string | null;
      }>();

    if (existingError) {
      console.error(
        "[inspection-photo-reconcile] evidence lookup failed",
        existingError,
      );
      skipped += 1;
      continue;
    }

    if (existing) {
      if (existing.work_order_id !== args.workOrderId) {
        skipped += 1;
        continue;
      }
      if (existing.work_order_line_id === args.workOrderLineId) continue;
      if (existing.work_order_line_id !== null) {
        skipped += 1;
        continue;
      }
      const { error: relinkError } = await admin
        .from("work_order_media")
        .update({ work_order_line_id: args.workOrderLineId })
        .eq("id", existing.id)
        .eq("shop_id", args.shopId)
        .eq("work_order_id", args.workOrderId)
        .is("work_order_line_id", null);
      if (relinkError) {
        console.error(
          "[inspection-photo-reconcile] evidence relink failed",
          relinkError,
        );
        skipped += 1;
      } else {
        linked += 1;
      }
      continue;
    }

    const fileName = object.path.split("/").at(-1) ?? null;
    const { error: insertError } = await admin.from("work_order_media").insert({
      shop_id: args.shopId,
      work_order_id: args.workOrderId,
      work_order_line_id: args.workOrderLineId,
      user_id: photo.user_id,
      url: photo.image_url,
      kind: "photo",
      storage_bucket: object.bucket,
      storage_path: object.path,
      file_name: fileName,
      source: "inspection_photo",
      client_mutation_id: `inspection-photo:${photo.id}`,
      visibility: "internal",
    });

    if (insertError) {
      // A concurrent request may have linked the same immutable storage object.
      const { data: raced } = await admin
        .from("work_order_media")
        .select("id")
        .eq("shop_id", args.shopId)
        .eq("work_order_id", args.workOrderId)
        .eq("work_order_line_id", args.workOrderLineId)
        .eq("storage_bucket", object.bucket)
        .eq("storage_path", object.path)
        .maybeSingle<{ id: string }>();
      if (!raced?.id) {
        console.error(
          "[inspection-photo-reconcile] evidence insert failed",
          insertError,
        );
        skipped += 1;
        continue;
      }
    }
    linked += 1;
  }

  return { linked, skipped };
}
