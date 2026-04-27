import { describe, expect, it } from "vitest";
import { deleteOnboardingSession } from "@/features/onboarding-agent/server/deleteOnboardingSession";

function createSupabaseMock() {
  const deletedTables: string[] = [];
  const removedStorage: Array<{ bucket: string; paths: string[] }> = [];

  const sessionRows = [{ id: "session-1", shop_id: "shop-1" }];
  const fileRows = [
    { id: "file-1", session_id: "session-1", shop_id: "shop-1", storage_bucket: "onboarding", storage_path: "shop-1/session-1/file-1.csv" },
    { id: "file-2", session_id: "session-1", shop_id: "shop-1", storage_bucket: "onboarding", storage_path: "shop-1/session-1/file-2.csv" },
  ];
  const liveTableRows = [{ id: "customer-live-1", shop_id: "shop-1" }];

  const makeQuery = (table: string) => {
    let mode: "select" | "delete" = "select";
    let filters: Record<string, string> = {};
    let selected = "*";

    const runSelect = async () => {
      if (table === "onboarding_sessions" && selected === "id") {
        const row = sessionRows.find((item) => item.id === filters.id && item.shop_id === filters.shop_id);
        return { data: row ?? null, error: null };
      }
      if (table === "onboarding_files") {
        const rows = fileRows.filter((item) => item.shop_id === filters.shop_id && item.session_id === filters.session_id);
        return { data: rows, error: null };
      }
      if (table === "customers") {
        return { data: liveTableRows, error: null };
      }
      return { data: [], error: null };
    };

    const runDelete = async () => {
      deletedTables.push(table);
      return { error: null };
    };

    return {
      select(columns: string) {
        selected = columns;
        mode = "select";
        return this;
      },
      delete() {
        mode = "delete";
        return this;
      },
      eq(column: string, value: string) {
        filters = { ...filters, [column]: value };
        return this;
      },
      maybeSingle() {
        if (mode === "select") return runSelect();
        return runDelete();
      },
      then(resolve: (value: any) => unknown, reject?: (reason?: unknown) => unknown) {
        const output = mode === "select" ? runSelect() : runDelete();
        return output.then(resolve, reject);
      },
    };
  };

  const supabase = {
    from(table: string) {
      return makeQuery(table);
    },
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            removedStorage.push({ bucket, paths });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };

  return { supabase, deletedTables, removedStorage, liveTableRows };
}

describe("deleteOnboardingSession", () => {
  it("deletes only staged onboarding tables for the owned shop session", async () => {
    const { supabase, deletedTables, removedStorage, liveTableRows } = createSupabaseMock();

    const result = await deleteOnboardingSession({
      supabase: supabase as any,
      shopId: "shop-1",
      sessionId: "session-1",
    });

    expect(result.deletedSessionId).toBe("session-1");
    expect(result.deletedFiles).toBe(2);
    expect(result.storageWarnings).toEqual([]);
    expect(deletedTables).toEqual([
      "onboarding_entity_links",
      "onboarding_review_items",
      "onboarding_entities",
      "onboarding_raw_rows",
      "onboarding_files",
      "onboarding_activation_plans",
      "onboarding_sessions",
    ]);
    expect(removedStorage).toEqual([
      {
        bucket: "onboarding",
        paths: ["shop-1/session-1/file-1.csv", "shop-1/session-1/file-2.csv"],
      },
    ]);
    expect(liveTableRows).toHaveLength(1);
  });
});
