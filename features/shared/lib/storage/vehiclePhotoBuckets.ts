import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The work-order create page has written vehicle photos to the hyphenated
 * `vehicle-photos` bucket since it was written (create/page.tsx:1878-1909).
 * The customer detail page's uploader takes a different path: it probes a
 * list of bucket candidates and falls back to the underscore-named
 * `vehicle_photos` bucket whenever the primary bucket rejects an upload
 * (features/customers/app/customers/[id]/page.tsx). Before the primary
 * bucket was provisioned by a migration, that fallback fired on every
 * upload in any environment where nobody had created it by hand.
 *
 * `vehicle_media` never records which bucket a path landed in, so a reader
 * has to probe both rather than assume the primary one.
 */
export const VEHICLE_PHOTO_BUCKET_PRIMARY = "vehicle-photos";
export const VEHICLE_PHOTO_BUCKET_LEGACY = "vehicle_photos";

/**
 * Sign a batch of `vehicle_media.storage_path` values, falling back to the
 * legacy bucket only for whichever paths the primary bucket doesn't
 * recognize. Two batched requests at most -- never one probe per path -- and
 * a path present in neither bucket is simply omitted from the result;
 * callers already treat a missing signed URL as "render the text
 * fallback".
 */
export async function signVehiclePhotoPaths(
  supabase: Pick<SupabaseClient, "storage">,
  paths: string[],
  expiresInSeconds: number,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => Boolean(path?.trim()))),
  );
  if (!uniquePaths.length) return signed;

  const { data: primary } = await supabase.storage
    .from(VEHICLE_PHOTO_BUCKET_PRIMARY)
    .createSignedUrls(uniquePaths, expiresInSeconds);

  const unresolved: string[] = [];
  for (const entry of primary ?? []) {
    if (entry.path && entry.signedUrl) {
      signed.set(entry.path, entry.signedUrl);
    } else if (entry.path) {
      unresolved.push(entry.path);
    }
  }
  // A whole-call failure (network/auth) returns no data at all, so every
  // requested path is worth a legacy-bucket attempt, not just the ones a
  // per-path 404 named.
  if (!primary) unresolved.push(...uniquePaths);

  if (!unresolved.length) return signed;

  const { data: legacy } = await supabase.storage
    .from(VEHICLE_PHOTO_BUCKET_LEGACY)
    .createSignedUrls(unresolved, expiresInSeconds);
  for (const entry of legacy ?? []) {
    if (entry.path && entry.signedUrl) {
      signed.set(entry.path, entry.signedUrl);
    }
  }

  return signed;
}
