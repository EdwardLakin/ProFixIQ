import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const repository = read("features/parts/offline/partsRequestDrafts.ts");
const editor = read("features/parts/offline/AdvisorPartsDraftEditor.tsx");
const createPage = read("app/mobile/work-orders/create/page.tsx");
const modal = read(
  "features/work-orders/components/workorders/PartsRequestModal.tsx",
);
const replay = read("features/shared/lib/offline/replay.ts");
const route = read("app/api/offline/parts-request-drafts/route.ts");
const migration = read(
  "supabase/migrations/20260717100000_offline_parts_request_drafts.sql",
);

describe("offline parts-request drafts", () => {
  it("stores drafts in tenant-scoped IndexedDB with stable operation identities", () => {
    expect(repository).toContain('const KIND = "parts-request-draft"');
    expect(repository).toContain("listOfflineSnapshots");
    expect(repository).toContain("saveOfflineSnapshot");
    expect(repository).toContain("userId: draft.userId");
    expect(repository).toContain("shopId: draft.shopId");
    expect(repository).toContain(
      "operationKey: `parts-draft:${id}:materialize`",
    );
    expect(repository).not.toContain("localStorage");
  });

  it("attaches advisor drafts to temporary lines and resolves them after work-order creation", () => {
    expect(editor).toContain("workOrderDraftId");
    expect(editor).toContain("tempLineId: selectedLineId");
    expect(editor).toContain("Save parts draft");
    expect(createPage).toContain("<AdvisorPartsDraftEditor");
    expect(createPage).toContain("materialization.lineIdMap");
    expect(createPage).toContain("resolveAndSubmitDependentPartsDrafts");
    expect(repository).toContain("args.lineIdMap[draft.tempLineId]");
    expect(repository).toContain(
      "A parts-request draft could not be matched to its saved job line.",
    );
    expect(createPage).toContain("pruneDependentPartsRequestDrafts");
  });

  it("uses the global ordered mutation queue for both advisor and technician requests", () => {
    expect(repository).toContain("runMutationWithOfflineQueue");
    expect(repository).toContain('actionType: "parts-request:create-draft"');
    expect(repository).toContain("clientMutationId: draft.operationKey");
    expect(repository).toContain("orderKey:");
    expect(modal).toContain("submitOfflinePartsRequestDraft");
    expect(modal).not.toContain('fetch("/api/parts/requests/create"');
    expect(replay).toContain('"parts-request:create-draft"');
    expect(replay).toContain("postOfflinePartsRequestDraft(draft)");
    expect(replay).toContain("removeOfflinePartsRequestDraft");
  });

  it("derives server scope from the actor and initializes the RLS shop context", () => {
    expect(route).toContain("auth.getUser()");
    expect(route).toContain("getActorCapabilities");
    expect(route).toContain("draft.userId !== user.id");
    expect(route).toContain("draft.shopId !== profile.shop_id");
    expect(route).toContain('rpc("set_current_shop_id"');
    expect(route).toContain("materialize_offline_parts_request_draft_atomic");
  });

  it("materializes through the canonical parts RPC with receipt-backed idempotency", () => {
    expect(migration).toContain("offline_mutation_receipts");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE");
    expect(migration).toContain("create_part_request_with_items");
    expect(migration).toContain("update public.part_request_items");
    expect(migration).toContain(
      "set work_order_line_id = p_work_order_line_id",
    );
    expect(migration).toContain("wo.shop_id = p_shop_id");
    expect(migration).toContain("wol.work_order_id = p_work_order_id");
    expect(migration).toContain("wolt.technician_id = p_actor_user_id");
    expect(migration).toContain("when unique_violation then");
  });
});
