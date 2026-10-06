import "server-only";

import { DEMO_UPLOAD_BUCKET } from "@/features/integrations/shopBoost/demoUploadContract";

// Anonymous Instant Shop Analysis uploads land at
//   demos/<demoId>/<intakeId>/<dataset>-<uuid>.csv
// in the same bucket that holds real shop imports (shops/<shopId>/...). Files
// that were staged but never activated are not referenced by anything, so they
// accumulate. This module removes only those, and only under the demos/ prefix.

export const DEMO_UPLOAD_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const DEMO_ROOT = "demos";
const PAGE_SIZE = 100;
const MAX_DEMO_PAGES = 5;
const MAX_FILES_PER_RUN = 200;
const REMOVE_CHUNK = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageEntry = { name: string; id: string | null; created_at?: string | null };

type StorageBucketLike = {
  list: (
    path: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
};

export type PurgeClient = {
  storage: { from: (bucket: string) => StorageBucketLike };
  from: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => PromiseLike<{
        data: Array<{ id: string; shop_id: string | null }> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export type PurgeOrphanDemoUploadsResult = {
  dryRun: boolean;
  scannedDemos: number;
  candidateFiles: number;
  deletedFiles: number;
  skippedActivatedDemos: number;
  truncated: boolean;
  /** Page to pass as startPage to continue; null when the scan reached the end. */
  nextPage: number | null;
};

async function listAll(
  bucket: StorageBucketLike,
  path: string,
): Promise<StorageEntry[]> {
  const { data, error } = await bucket.list(path, { limit: PAGE_SIZE });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function purgeOrphanDemoUploads(args: {
  admin: PurgeClient;
  apply: boolean;
  now?: number;
  retentionMs?: number;
  startPage?: number;
}): Promise<PurgeOrphanDemoUploadsResult> {
  const bucket = args.admin.storage.from(DEMO_UPLOAD_BUCKET);
  const cutoff = (args.now ?? Date.now()) - (args.retentionMs ?? DEMO_UPLOAD_RETENTION_MS);
  const startPage = Math.max(0, Math.floor(args.startPage ?? 0));

  const deletable: string[] = [];
  let scannedDemos = 0;
  let skippedActivatedDemos = 0;
  let truncated = false;
  let nextPage: number | null = null;

  // Whole pages of demo folders are processed at a time: activation is checked
  // for each page *before* its files count toward the per-run cap, so a long
  // run of activated demos cannot use up the cap and starve later pages.
  for (let page = startPage; page < startPage + MAX_DEMO_PAGES; page += 1) {
    const { data, error } = await bucket.list(DEMO_ROOT, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (error) throw new Error(error.message);
    const entries = data ?? [];
    const demoFolders = entries.filter((entry) => UUID_PATTERN.test(entry.name));

    const candidatesByDemo = new Map<string, string[]>();
    for (const demo of demoFolders) {
      scannedDemos += 1;
      for (const intake of await listAll(bucket, `${DEMO_ROOT}/${demo.name}`)) {
        if (!UUID_PATTERN.test(intake.name)) continue;
        for (const file of await listAll(bucket, `${DEMO_ROOT}/${demo.name}/${intake.name}`)) {
          const createdAt = file.created_at ? Date.parse(file.created_at) : NaN;
          if (!file.id || !file.name.endsWith(".csv") || !Number.isFinite(createdAt) || createdAt > cutoff) {
            continue;
          }
          const path = `${DEMO_ROOT}/${demo.name}/${intake.name}/${file.name}`;
          candidatesByDemo.set(demo.name, [...(candidatesByDemo.get(demo.name) ?? []), path]);
        }
      }
    }

    // A demo that was activated by a shop keeps its source files: activation
    // copies them, but a retry may still read the originals.
    const activatedDemoIds = new Set<string>();
    const demoIds = [...candidatesByDemo.keys()];
    if (demoIds.length) {
      const { data: rows, error: activationError } = await args.admin
        .from("demo_shop_boosts")
        .select("id,shop_id")
        .in("id", demoIds);
      if (activationError) throw new Error(activationError.message);
      for (const row of rows ?? []) {
        if (row.shop_id) activatedDemoIds.add(row.id);
      }
    }
    skippedActivatedDemos += activatedDemoIds.size;

    for (const [demoId, paths] of candidatesByDemo) {
      if (activatedDemoIds.has(demoId)) continue;
      for (const path of paths) {
        if (path.startsWith(`${DEMO_ROOT}/`) && path.endsWith(".csv") && !path.includes("..")) {
          deletable.push(path);
        }
      }
    }

    if (entries.length < PAGE_SIZE) break; // reached the end of the listing
    nextPage = page + 1;
    if (deletable.length >= MAX_FILES_PER_RUN) {
      truncated = true;
      break;
    }
  }

  // Ran out of page budget with more listing left.
  if (nextPage !== null && !truncated) truncated = true;
  if (!truncated) nextPage = null;

  let deletedFiles = 0;
  if (args.apply) {
    for (let index = 0; index < deletable.length; index += REMOVE_CHUNK) {
      const chunk = deletable.slice(index, index + REMOVE_CHUNK);
      const { error } = await bucket.remove(chunk);
      if (error) throw new Error(error.message);
      deletedFiles += chunk.length;
    }
  }

  return {
    dryRun: !args.apply,
    scannedDemos,
    candidateFiles: deletable.length,
    deletedFiles,
    skippedActivatedDemos,
    truncated,
    nextPage,
  };
}
