import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { inspectionPhotoStorageObject } from "@/features/inspections/server/reconcileInspectionPhotoEvidence";

type CanonicalMedia = {
  storage_bucket: string | null;
  storage_path: string | null;
};

/**
 * Re-sign persisted job-photo locators only after resolving their canonical
 * media row inside the requested Work Order. Admin signing is safe here because
 * the caller supplies a server-verified tenant scope and portal callers can
 * additionally require customer visibility.
 */
export async function signCanonicalWorkOrderPhotoUrls(args: {
  admin: SupabaseClient<Database>;
  shopId: string;
  workOrderId: string;
  urls: string[];
  customerVisibleOnly?: boolean;
  expiresIn?: number;
}): Promise<Array<string | null>> {
  let query = args.admin
    .from("work_order_media")
    .select("storage_bucket,storage_path")
    .eq("shop_id", args.shopId)
    .eq("work_order_id", args.workOrderId)
    .eq("storage_bucket", "job-photos")
    .not("storage_path", "is", null);
  if (args.customerVisibleOnly) query = query.eq("visibility", "customer");

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const canonicalPaths = new Set(
    ((data ?? []) as CanonicalMedia[])
      .filter(
        (row): row is { storage_bucket: "job-photos"; storage_path: string } =>
          row.storage_bucket === "job-photos" &&
          typeof row.storage_path === "string" &&
          row.storage_path.startsWith(`wo/${args.workOrderId}/`),
      )
      .map((row) => row.storage_path),
  );
  const expiresIn = Math.max(1, Math.trunc(args.expiresIn ?? 60 * 10));

  return Promise.all(
    args.urls.map(async (url) => {
      const object = inspectionPhotoStorageObject(url);
      if (
        !object ||
        object.bucket !== "job-photos" ||
        !canonicalPaths.has(object.path)
      ) {
        return null;
      }
      const { data: signed, error: signedError } = await args.admin.storage
        .from("job-photos")
        .createSignedUrl(object.path, expiresIn);
      return signedError ? null : (signed?.signedUrl ?? null);
    }),
  );
}
