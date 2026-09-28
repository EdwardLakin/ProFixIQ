import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type AdminSupabase = SupabaseClient<Database>;

type ReceiptCandidateRow = {
  id: string;
  shop_id: string;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
};

export type ExpireAbandonedReceiptAttachmentsInput = {
  supabase: AdminSupabase;
  /** Defaults to true: callers must opt in to actually deleting anything. */
  dryRun?: boolean;
  shopId?: string;
  limit?: number;
  now?: Date;
  /** Minimum age before an unlinked receipt is considered abandoned. */
  olderThanMs?: number;
};

export type ExpireAbandonedReceiptAttachmentsResult = {
  dryRun: boolean;
  now: string;
  candidates: number;
  candidateIds: string[];
  deleted: number;
  warnings: string[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
// A receipt is uploaded moments before the payment form is submitted in the
// same session, so anything still unlinked a day later was abandoned, not
// just mid-submission.
const DEFAULT_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

function toIsoString(now?: Date): string {
  if (!now) return new Date().toISOString();
  if (Number.isNaN(now.getTime())) {
    throw new Error(
      "Invalid now value supplied to expireAbandonedReceiptAttachments",
    );
  }
  return now.toISOString();
}

function sanitizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit as number), MAX_LIMIT));
}

export async function expireAbandonedReceiptAttachments(
  input: ExpireAbandonedReceiptAttachmentsInput,
): Promise<ExpireAbandonedReceiptAttachmentsResult> {
  const dryRun = input.dryRun ?? true;
  const nowIso = toIsoString(input.now);
  const limit = sanitizeLimit(input.limit);
  const olderThanMs = input.olderThanMs ?? DEFAULT_OLDER_THAN_MS;
  const cutoffIso = new Date(new Date(nowIso).getTime() - olderThanMs).toISOString();
  const warnings: string[] = [];

  let query = input.supabase
    .from("payment_receipt_attachments")
    .select("id, shop_id, storage_bucket, storage_path, created_at")
    .is("payment_event_id", null)
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (input.shopId) {
    query = query.eq("shop_id", input.shopId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Failed to load abandoned receipt attachments: ${error.message}`,
    );
  }

  const candidates = (data ?? []) as ReceiptCandidateRow[];
  let deleted = 0;

  if (!dryRun) {
    for (const row of candidates) {
      // Delete the row first, guarded by payment_event_id still null: if the
      // payment form submitted concurrently and linked this receipt between
      // our select and this delete, the guard matches zero rows and we skip
      // removing the storage object, leaving the now-linked receipt intact.
      const { data: removedRow, error: deleteError } = await input.supabase
        .from("payment_receipt_attachments")
        .delete()
        .eq("id", row.id)
        .eq("shop_id", row.shop_id)
        .is("payment_event_id", null)
        .select("id")
        .maybeSingle();

      if (deleteError) {
        warnings.push(
          `Failed to delete receipt attachment ${row.id}: ${deleteError.message}`,
        );
        continue;
      }
      if (!removedRow) continue;

      const { error: storageError } = await input.supabase.storage
        .from(row.storage_bucket)
        .remove([row.storage_path]);

      if (storageError) {
        warnings.push(
          `Deleted receipt attachment row ${row.id} but failed to remove storage object ${row.storage_bucket}/${row.storage_path}: ${storageError.message}`,
        );
      }

      deleted += 1;
    }
  }

  return {
    dryRun,
    now: nowIso,
    candidates: candidates.length,
    candidateIds: candidates.map((row) => row.id),
    deleted,
    warnings,
  };
}
