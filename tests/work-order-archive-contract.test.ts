import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260829204500_archive_work_orders_atomically.sql",
);
const archiveRoute = read("app/api/work-orders/[id]/archive/route.ts");
const viewPage = read("features/work-orders/app/work-orders/view/page.tsx");
const queuePage = read("features/work-orders/app/work-orders/queue/page.tsx");
const advisorWidget = read(
  "features/work-orders/components/dashboard/AdvisorQueueWidget.tsx",
);
const boardHook = read("features/shared/hooks/useWorkOrderBoard.ts");
const mobileQueue = read("features/mobile/work-orders/MobileWorkOrderQueue.tsx");
const mobileHome = read(
  "features/mobile/dashboard/server/getMobileHomePayload.ts",
);
const generatedTypes = read("features/shared/types/types/supabase.ts");

describe("work order archive contract", () => {
  it("keeps archive additive instead of repurposing a lifecycle status", () => {
    expect(migration).toContain("add column if not exists archived_at");
    expect(migration).toContain("add column if not exists archived_by_user_id");
    // Archive must never write a lifecycle status; the record keeps the status
    // it had so an archived in-progress job is still in progress.
    expect(migration).toContain("'status_preserved', v_work_order.status");
    expect(migration).not.toContain("set status = 'cancelled'");
  });

  it("derives the archive timestamp server-side", () => {
    // A caller-supplied timestamp on a SECURITY DEFINER RPC granted to
    // `authenticated` would let an authorized actor forge archive chronology
    // and the matching activity_logs ordering.
    expect(migration).toContain("v_now timestamptz := now();");
    expect(migration).toContain(
      "public.archive_work_order_atomic(uuid, uuid, uuid)",
    );
    expect(migration).not.toContain(
      "public.archive_work_order_atomic(uuid, uuid, uuid, timestamptz)",
    );
  });

  it("refuses archive while the record is still operationally live", () => {
    expect(migration).toContain("ARCHIVE_ESTIMATE");
    expect(migration).toContain("ARCHIVE_FLEET_LINKED");
    expect(migration).toContain("ARCHIVE_FINANCIALLY_LOCKED");
    expect(migration).toContain("ARCHIVE_ACTIVE_SERVICE_VISIT");
    expect(migration).toContain("ARCHIVE_ACTIVE_LABOR");
    // The parent row is locked before the guards run so concurrent writers
    // serialize against the archive decision rather than racing it.
    expect(migration).toContain("from public.work_orders wo\n  where wo.id = p_work_order_id\n    and wo.shop_id = p_shop_id\n  for update;");
  });

  it("is idempotent for a repeated archive of the same record", () => {
    expect(migration).toContain("if v_work_order.archived_at is not null then");
    expect(migration).toContain("'idempotent', true");
  });

  it("makes the guarded RPC the only path that can move archive state", () => {
    expect(migration).toContain(
      "create or replace function public.enforce_work_order_archive_write_boundary()",
    );
    expect(migration).toContain("WORK_ORDER_ARCHIVE_DIRECT_WRITE");
    expect(migration).toContain(
      "create trigger work_orders_enforce_archive_write_boundary",
    );
    expect(migration).toContain(
      "perform set_config('app.work_order_archiving', '1', true);",
    );
  });

  it("rejects labor, invoicing, and dispatch against an archived parent", () => {
    expect(migration).toContain(
      "if v_action in ('start','resume') and v_work_order.archived_at is not null then",
    );
    expect(migration).toContain(
      "create trigger invoice_versions_reject_archived_work_order",
    );
    expect(migration).toContain(
      "create trigger service_visits_reject_archived_work_order",
    );
    // Both boundary triggers must lock the parent, otherwise a plain read would
    // not block against an archive that has not committed yet.
    expect(migration.match(/for share;/g)?.length).toBe(2);
  });

  it("does not deadlock an ordinary Service Visit update against archive", () => {
    // archive locks work_orders then service_visits; a visit UPDATE already
    // holds the visit row, so re-checking the parent on every update would
    // invert the lock order.
    expect(migration).toContain("if tg_op = 'UPDATE'");
    expect(migration).toContain(
      "and new.work_order_id is not distinct from old.work_order_id",
    );
  });

  it("routes the archive action through the shop-scoped capability guard", () => {
    expect(archiveRoute).toContain('requiredCapability: "canManageWorkOrders"');
    expect(archiveRoute).toContain('rpcClient.rpc("archive_work_order_atomic"');
    // The route must not hand the RPC a client-controlled timestamp.
    expect(archiveRoute).not.toContain("p_at");
  });

  it("gates the archive control on the same decision as the server", () => {
    expect(viewPage).toContain("canMutateWorkOrders");
    expect(viewPage).toContain("setCanArchive");
    expect(viewPage).toContain("{canArchive &&");
  });

  it("restores the row when the archive request never reaches the server", () => {
    expect(viewPage).toContain(
      "Could not reach the server. The work order was not archived.",
    );
  });

  it("filters archived work by archive state, never by cancelled status", () => {
    expect(viewPage).toContain('const ARCHIVED_FILTER = "archived";');
    expect(viewPage).toContain('query.not("archived_at", "is", null)');
    expect(viewPage).toContain('.is("archived_at", null)');
    // A genuinely cancelled work order keeps its own filter and label.
    expect(viewPage).toContain('<option value="cancelled">Cancelled</option>');
  });

  it("removes archived work from every active operational surface", () => {
    for (const source of [
      queuePage,
      advisorWidget,
      mobileQueue,
      mobileHome,
    ]) {
      expect(source).toContain('.is("archived_at", null)');
    }
    expect(boardHook).toContain("archived_at");
    expect(boardHook).toContain("hiddenWorkOrderIds");
  });

  it("fills compact board limits with visible rows instead of truncating", () => {
    // A plain `.limit()` would spend a 5/10-row budget on rows that the
    // visibility filter then removes, leaving the widget short or empty.
    expect(boardHook).toContain("selectVisibleShopRows");
    expect(boardHook).toContain("query.range(range.from, range.to)");
    expect(boardHook).toContain("collected.length >= requestedLimit");
    expect(boardHook).not.toContain("unboundedActiveBoardRows");
  });

  it("publishes the archive contract in the generated schema types", () => {
    expect(generatedTypes).toContain("archive_work_order_atomic: {");
    expect(generatedTypes).toContain("archived_by_user_id");
  });
});
