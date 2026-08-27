import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { inspectionPhotoStorageObject } from "@/features/inspections/server/reconcileInspectionPhotoEvidence";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Converts durable private job-photo locators into short-lived presentation
 * URLs through the caller's authenticated Storage client. A failed private
 * authorization is represented as a missing image instead of leaking an
 * unusable public-bucket URL to the browser.
 */
export async function signInspectionPhotoRows<
  T extends { image_url: string | null },
>(args: {
  sessionClient: SupabaseClient<Database>;
  rows: T[];
  expiresIn?: number;
}): Promise<T[]> {
  const expiresIn = Math.max(
    1,
    Math.trunc(args.expiresIn ?? DEFAULT_SIGNED_URL_TTL_SECONDS),
  );

  return Promise.all(
    args.rows.map(async (row) => {
      const object = inspectionPhotoStorageObject(row.image_url);
      if (!object || object.bucket !== "job-photos") return row;

      const { data, error } = await args.sessionClient.storage
        .from(object.bucket)
        .createSignedUrl(object.path, expiresIn);

      return {
        ...row,
        image_url: error || !data?.signedUrl ? null : data.signedUrl,
      };
    }),
  );
}
