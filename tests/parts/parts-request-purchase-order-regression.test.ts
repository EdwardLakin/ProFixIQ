import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260807153800_repair_parts_request_to_po.sql",
  "utf8",
);
const receiptMigration = readFileSync(
  "supabase/migrations/20260807155907_harden_free_text_po_receipt_and_attachment.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/parts/parts-request-purchase-order.runtime.sql",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/supabase-clean-replay-audit.yml",
  "utf8",
);
const requestPage = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const poLineRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/po-line/route.ts",
  "utf8",
);
const orderModal = readFileSync(
  "features/parts/components/request-workbench/OrderPartModal.tsx",
  "utf8",
);
const receivePage = readFileSync("app/parts/po/[id]/receive/page.tsx", "utf8");
const generatedTypes = readFileSync(
  "features/shared/types/types/supabase.ts",
  "utf8",
);

const innerRpc = migration.slice(
  0,
  migration.indexOf(
    "create or replace function public.parts_create_or_reuse_po_line_for_request",
  ),
);
const acquisitionBranch = innerRpc.slice(
  innerRpc.indexOf("A caller-supplied acquisition cost is authoritative"),
  innerRpc.indexOf("if v_acquisition_cost is null"),
);

describe("parts request purchase-order regression contract", () => {
  it("keeps wrapper and inner authorization tenant-scoped and role-compatible", () => {
    const profileIdChecks =
      migration.match(/profile\.id = auth\.uid\(\)/g)?.length ?? 0;
    const profileUserIdChecks =
      migration.match(/profile\.user_id = auth\.uid\(\)/g)?.length ?? 0;
    expect(profileIdChecks).toBeGreaterThanOrEqual(2);
    expect(profileUserIdChecks).toBe(profileIdChecks);
    expect(migration.match(/'lead_hand', 'foreman'/g)?.length ?? 0).toBe(
      profileIdChecks,
    );
    expect(migration.match(/PARTS_REQUEST_VENDOR_MISMATCH/g)).toHaveLength(2);
    expect(migration).toContain(
      "Purchase order supplier belongs to a different shop.",
    );
  });

  it("supports free-text lines without inventing inventory identity", () => {
    expect(innerRpc).toContain("if v_item.part_id is null then");
    expect(innerRpc).toContain("message = 'PARTS_ACQUISITION_COST_REQUIRED'");
    expect(innerRpc).toContain("v_wop_id := null");
    expect(innerRpc).toContain(
      "v_wop_id := public.parts_ensure_work_order_part(p_request_item_id)",
    );
    expect(orderModal).toContain("Use Attach Part or Add to Stock");
    expect(poLineRoute).toContain('code: "PARTS_ACQUISITION_COST_REQUIRED"');
    expect(poLineRoute).toContain("{ status: 409 }");
  });

  it("keeps acquisition cost distinct from sell and persists only the cost field", () => {
    const explicitCost = acquisitionBranch.indexOf("p_unit_cost,");
    const stagedCost = acquisitionBranch.indexOf("then v_item.unit_cost");
    const catalogCost = acquisitionBranch.indexOf("v_part.cost");
    const fallbackCost = acquisitionBranch.indexOf("v_part.default_cost");

    expect(explicitCost).toBeGreaterThan(-1);
    expect(stagedCost).toBeGreaterThan(explicitCost);
    expect(catalogCost).toBeGreaterThan(stagedCost);
    expect(fallbackCost).toBeGreaterThan(catalogCost);
    expect(innerRpc).toContain("unit_cost = v_acquisition_cost");
    expect(innerRpc).not.toMatch(/unit_price\s*=\s*v_acquisition_cost/);
    expect(innerRpc).not.toMatch(/quoted_price\s*=\s*v_acquisition_cost/);
    expect(migration).toContain(
      "create or replace function private.normalize_purchase_order_line_cost()",
    );
    expect(migration).toContain("coalesce(part.cost, part.default_cost)");
    expect(innerRpc).toContain(
      "coalesce(v_item.quoted_price, v_item.unit_price)",
    );
    expect(requestPage).toMatch(/item\.quoted_price\s*\?\?\s*item\.unit_price/);
    expect(requestPage).toMatch(
      /selectedInventoryPart\?\.cost\s*\?\?\s*selectedInventoryPart\?\.default_cost/,
    );
    expect(requestPage).toMatch(
      /acquisitionCostOverride\s*\?\?\s*stagedAcquisitionCost\s*\?\?\s*catalogAcquisitionCost/,
    );
  });

  it("binds idempotency to the full request and returns existing domain identity", () => {
    for (const field of [
      "request_item_id",
      "qty",
      "po_id",
      "supplier_id",
      "unit_cost",
      "location_id",
      "notes",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(migration).toContain(
      "v_operation.result -> '_request' is distinct from v_request_payload",
    );
    expect(migration).toContain("if v_operation.result ? '_request' then");
    expect(migration).toContain("into v_legacy_line");
    expect(migration).toContain("line.idempotency_key = p_idempotency_key");
    expect(migration).toContain("v_operation.result := v_operation.result");
    expect(migration).toContain("'_request', v_request_payload");
    expect(migration).toContain(
      "if v_operation_was_visible\n     and p_supplier_id is not null",
    );
    expect(migration).toContain("'work_order_part_id', v_existing_wop_id");
    expect(migration).toContain("for update;");
    expect(migration).toContain("'draft'");
  });

  it("uses one PO-first row-lock order across ordering, receiving, and attachment", () => {
    const innerPoLock = innerRpc.indexOf(
      "from public.purchase_orders\n  where id = p_po_id\n  for update",
    );
    const innerItemLock = innerRpc.indexOf(
      "from public.part_request_items\n  where id = p_request_item_id\n  for update",
    );
    expect(innerPoLock).toBeGreaterThan(-1);
    expect(innerItemLock).toBeGreaterThan(innerPoLock);

    const wrapperRpc = migration.slice(
      migration.indexOf(
        "create or replace function public.parts_create_or_reuse_po_line_for_request",
      ),
    );
    const wrapperExistingPoLock = wrapperRpc.indexOf(
      "-- Explicit target: PO is known up front, so acquire it before the item.",
    );
    const wrapperItemLock = wrapperRpc.indexOf(
      "-- Existing targets are now held. Lock and re-read the mutable request item.",
    );
    expect(wrapperExistingPoLock).toBeGreaterThan(-1);
    expect(wrapperItemLock).toBeGreaterThan(wrapperExistingPoLock);
    expect(wrapperRpc).toContain(
      "-- Supplier-backed create/reuse is serialized by the tenant supplier row.",
    );
    const supplierSerialization = wrapperRpc.slice(
      wrapperRpc.indexOf(
        "-- Supplier-backed create/reuse is serialized by the tenant supplier row.",
      ),
      wrapperRpc.indexOf("if v_po_id is not null then"),
    );
    expect(supplierSerialization).toContain("for no key update");
    expect(supplierSerialization).not.toContain("for update;");
    expect(supplierSerialization).toContain(
      "compatible with the KEY SHARE lock taken by a purchase-order supplier FK",
    );
    expect(wrapperRpc).toContain(
      "order by purchase_order.created_at desc, purchase_order.id desc",
    );

    const receiptPoLock = receiptMigration.indexOf(
      "from public.purchase_orders purchase_order\n  where purchase_order.id = p_po_id\n  for update",
    );
    const receiptLineLock = receiptMigration.indexOf(
      "from public.purchase_order_lines line\n  where line.id = p_po_line_id\n  for update",
    );
    const receiptItemLock = receiptMigration.indexOf(
      "from public.part_request_items item\n    where item.id = v_request_item_id\n    for update",
    );
    expect(receiptPoLock).toBeGreaterThan(-1);
    expect(receiptLineLock).toBeGreaterThan(receiptPoLock);
    expect(receiptItemLock).toBeGreaterThan(receiptLineLock);

    const attachRpc = receiptMigration.slice(
      receiptMigration.indexOf(
        "create or replace function public.parts_attach_inventory_to_request_item_atomic",
      ),
      receiptMigration.indexOf(
        "create or replace function public.parts_receive_free_text_po_line",
      ),
    );
    expect(
      attachRpc.indexOf("from public.purchase_orders purchase_order"),
    ).toBeLessThan(attachRpc.indexOf("from public.purchase_order_lines line"));
    expect(
      attachRpc.indexOf("from public.purchase_order_lines line"),
    ).toBeLessThan(
      attachRpc.indexOf(
        "from public.part_request_items item\n  where item.id = p_item_id\n  for update",
      ),
    );
  });

  it("runs the discoverable two-shop flow during clean replay", () => {
    expect(runtime).toContain("-- @regression-flow parts.request-to-po");
    expect(runtime).toContain("PARTS_ORDER_IDEMPOTENCY_CONFLICT");
    expect(runtime).toContain("PARTS_REQUEST_VENDOR_MISMATCH");
    expect(runtime).toContain(
      "distinct staged acquisition cost did not beat catalog cost",
    );
    expect(runtime).toContain("manual ordering fabricated a WOP");
    expect(runtime).toContain("catalog_legacy_exact_replay");
    expect(runtime).toContain("multi_po_earlier_line_receipt");
    expect(runtime).toContain("generic_only_po_completion");
    expect(runtime).toContain("generic_only_po_completion_replay");
    expect(runtime).toContain("mixed_po_partial_completion");
    expect(runtime).toContain("mixed_po_final_completion");
    expect(workflow).toContain(
      "-f tests/parts/parts-request-purchase-order.runtime.sql",
    );
    expect(workflow).toContain("parts-request-purchase-order-runtime.log");
    expect(workflow).toContain(
      "tests/parts/parts-request-purchase-order-locking.runtime.sh",
    );
    expect(workflow).toContain(
      "parts-request-purchase-order-locking-runtime.log",
    );
  });

  it("keeps request-backed and generic free-text receipt atomic", () => {
    expect(receiptMigration).toContain(
      "function public.parts_receive_free_text_po_line",
    );
    expect(receiptMigration).toContain(
      "'generic_line', v_request_item_id is null",
    );
    expect(receiptMigration).toContain(
      "PARTS_ORDERED_FREE_TEXT_ATTACH_BLOCKED",
    );
    expect(receiptMigration).toContain(
      "function public.parts_attach_inventory_to_request_item_atomic",
    );
    expect(receiptMigration).toContain("set status = 'received'");
    expect(receiptMigration).toContain(
      "coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0)",
    );
    expect(receiptMigration).toContain("'po_closed', v_po_closed");
    expect(receiptMigration).toContain("'po_status', v_po_status");
    expect(receiptMigration).not.toContain(
      "v_item.po_id is distinct from p_po_id",
    );
    expect(receivePage).toContain("/receive-free-text");
    const freeTextHandler = receivePage.slice(
      receivePage.indexOf("const receiveFreeTextLine"),
      receivePage.indexOf("const startScan"),
    );
    expect(freeTextHandler).not.toContain('.from("purchase_order_lines")');
    expect(freeTextHandler).not.toContain('.from("part_request_items")');
    expect(generatedTypes).toContain("parts_receive_free_text_po_line:");
    expect(generatedTypes).toContain(
      "parts_attach_inventory_to_request_item_atomic:",
    );
  });
});
