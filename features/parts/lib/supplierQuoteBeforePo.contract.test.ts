import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808180155_parts_supplier_quote_before_po.sql",
  "utf8",
);
const poIdentityMigration = readFileSync(
  "supabase/migrations/20260808184344_align_supplier_quote_po_identity.sql",
  "utf8",
);
const requestRoute = readFileSync(
  "app/api/parts/requests/[requestId]/supplier-quote/route.ts",
  "utf8",
);
const responseRoute = readFileSync(
  "app/api/parts/requests/[requestId]/supplier-quote/[quoteRequestId]/response/route.ts",
  "utf8",
);
const poContactRoute = readFileSync(
  "app/api/parts/purchase-orders/[poId]/supplier-contact/route.ts",
  "utf8",
);
const workbenchHeader = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbenchHeader.tsx",
  "utf8",
);

describe("supplier quote before PO contract", () => {
  it("records quote sourcing without creating a purchase order", () => {
    const createQuoteFunction = migration.slice(
      migration.indexOf("create or replace function public.parts_create_supplier_quote_request"),
      migration.indexOf(
        "revoke all on function public.parts_create_supplier_quote_request",
      ),
    );

    expect(createQuoteFunction).toContain(
      "insert into public.parts_supplier_quote_requests",
    );
    expect(createQuoteFunction).toContain(
      "insert into public.parts_supplier_quote_request_items",
    );
    expect(createQuoteFunction).not.toContain("insert into public.purchase_orders");
  });

  it("uses the work order number in supplier communication", () => {
    expect(requestRoute).toContain('.select("id,custom_id")');
    expect(requestRoute).toContain("buildSupplierQuoteDraft");
    expect(requestRoute).toContain("workOrderNumber");
  });

  it("replaces premature PO creation with supplier quote sourcing", () => {
    expect(workbenchHeader).toContain("Request Supplier Quote");
    expect(workbenchHeader).not.toContain(">Create PO<");
  });

  it("records the supplier response and refreshes customer quote pricing", () => {
    expect(responseRoute).toContain("parts_record_supplier_quote_response");
    expect(responseRoute).toContain("syncQuoteLinePartsStatus");
    expect(migration).toContain("quoted_sell_price");
    expect(migration).toContain("supplier_quote_received_at = now()");
  });

  it("groups approved quote items onto one automatic draft PO", () => {
    expect(migration).toContain(
      "create or replace function private.parts_materialize_supplier_quote_draft_po",
    );
    expect(migration).toContain(
      "unique index if not exists purchase_orders_supplier_quote_request_key",
    );
    expect(migration).toContain("on conflict (supplier_quote_request_id)");
    expect(migration).toContain("'draft'");
  });

  it("keeps secondary PO references aligned with the existing UUID identity", () => {
    expect(poIdentityMigration).toContain(
      "new.po_number := 'PO-' || upper(new.id::text)",
    );
    expect(poIdentityMigration).not.toContain("left(replace(new.id::text");
  });

  it("keeps the work order primary when prompting supplier PO contact", () => {
    expect(poContactRoute).toContain("buildPurchaseOrderContactDraft");
    expect(poContactRoute).toContain("workOrderNumber");
    expect(poContactRoute).toContain("parts_mark_purchase_order_contacted");
  });
});
