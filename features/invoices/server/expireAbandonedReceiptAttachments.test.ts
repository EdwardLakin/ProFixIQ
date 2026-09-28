import { describe, expect, it } from "vitest";
import { expireAbandonedReceiptAttachments } from "./expireAbandonedReceiptAttachments";

type FakeRow = {
  id: string;
  shop_id: string;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
};

function createFakeAdminSupabase(options: {
  rows: FakeRow[];
  /** ids that lost the concurrency race: a payment linked them between select and delete. */
  blockedIds?: Set<string>;
  storageError?: { path: string; message: string };
}) {
  const deletedIds: string[] = [];
  const removedPaths: string[] = [];

  function makeChain() {
    const eqValues: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      is: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (column: string, value: string) => {
        eqValues[column] = value;
        return chain;
      },
      delete: () => chain,
      maybeSingle: async () => {
        const id = eqValues.id;
        if (options.blockedIds?.has(id)) {
          return { data: null, error: null };
        }
        deletedIds.push(id);
        return { data: { id }, error: null };
      },
      then: (resolve: (value: { data: FakeRow[]; error: null }) => void) => {
        resolve({ data: options.rows, error: null });
      },
    };
    return chain;
  }

  const supabase = {
    from: (table: string) => {
      if (table !== "payment_receipt_attachments") {
        throw new Error(`Unexpected table ${table}`);
      }
      return makeChain();
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          for (const path of paths) {
            if (options.storageError?.path === path) {
              return { data: null, error: { message: options.storageError.message } };
            }
            removedPaths.push(`${bucket}/${path}`);
          }
          return { data: null, error: null };
        },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, deletedIds, removedPaths };
}

const ROW: FakeRow = {
  id: "receipt-1",
  shop_id: "shop-1",
  storage_bucket: "payment-receipts",
  storage_path: "wo/wo-1/payments/abc_receipt.jpg",
  created_at: "2026-09-01T00:00:00.000Z",
};

describe("expireAbandonedReceiptAttachments", () => {
  it("defaults to dryRun and never deletes anything", async () => {
    const { supabase, deletedIds, removedPaths } = createFakeAdminSupabase({
      rows: [ROW],
    });

    const result = await expireAbandonedReceiptAttachments({ supabase });

    expect(result.dryRun).toBe(true);
    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(0);
    expect(deletedIds).toEqual([]);
    expect(removedPaths).toEqual([]);
  });

  it("deletes the row and removes the storage object when dryRun is false", async () => {
    const { supabase, deletedIds, removedPaths } = createFakeAdminSupabase({
      rows: [ROW],
    });

    const result = await expireAbandonedReceiptAttachments({
      supabase,
      dryRun: false,
    });

    expect(result.deleted).toBe(1);
    expect(deletedIds).toEqual(["receipt-1"]);
    expect(removedPaths).toEqual([
      "payment-receipts/wo/wo-1/payments/abc_receipt.jpg",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("skips removing the storage object when the receipt was linked to a payment between select and delete", async () => {
    // The delete is guarded by `is("payment_event_id", null)`: if the
    // payment form submits concurrently and links the receipt first, the
    // guarded delete matches zero rows, and the storage object - now
    // evidence for a real payment - must never be removed.
    const { supabase, deletedIds, removedPaths } = createFakeAdminSupabase({
      rows: [ROW],
      blockedIds: new Set(["receipt-1"]),
    });

    const result = await expireAbandonedReceiptAttachments({
      supabase,
      dryRun: false,
    });

    expect(result.deleted).toBe(0);
    expect(deletedIds).toEqual([]);
    expect(removedPaths).toEqual([]);
  });

  it("still counts the row as deleted if the storage removal itself fails, but records a warning", async () => {
    const { supabase, deletedIds, removedPaths } = createFakeAdminSupabase({
      rows: [ROW],
      storageError: {
        path: ROW.storage_path,
        message: "object not found",
      },
    });

    const result = await expireAbandonedReceiptAttachments({
      supabase,
      dryRun: false,
    });

    expect(result.deleted).toBe(1);
    expect(deletedIds).toEqual(["receipt-1"]);
    expect(removedPaths).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("receipt-1");
  });
});
