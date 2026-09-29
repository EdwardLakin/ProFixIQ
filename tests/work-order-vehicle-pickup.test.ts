import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toPortalWorkOrderStatus } from "@/features/portal/lib/workOrderPresentation";
import { ACTIVE_WORK_ORDER_STATUSES } from "@/features/work-orders/lib/work-order-status";
import {
  CANONICAL_WORK_ORDER_OPERATIONAL_STAGES,
  normalizeWorkOrderOperationalStage,
  WORK_ORDER_OPERATIONAL_STAGE_LABELS,
} from "@/features/work-orders/lib/operational-stage";

const read = (path: string) => readFileSync(path, "utf8");

describe("vehicle pickup lifecycle: work order, invoice, payment stay independent", () => {
  it("treats a picked-up work order as complete regardless of payment state", () => {
    expect(
      toPortalWorkOrderStatus({
        status: "invoiced",
        pickedUpAt: "2026-09-28T18:00:00.000Z",
      }),
    ).toMatchObject({ key: "completed", label: "Picked up", complete: true });

    // Paying in full must never imply pickup, and vice versa - the two
    // remain independent signals in the portal status derivation. A paid,
    // invoiced work order stays "ready for pickup" until the vehicle is
    // actually collected.
    expect(
      toPortalWorkOrderStatus({
        status: "invoiced",
        paymentStatus: "paid",
        paidAt: "2026-09-28T18:00:00.000Z",
      }),
    ).toMatchObject({ key: "ready_for_pickup", complete: false });

    expect(
      toPortalWorkOrderStatus({ status: "invoiced" }),
    ).toMatchObject({ key: "ready_for_pickup", complete: false });
  });

  it("still hides cancelled work orders and keeps paid ones visible", () => {
    // Regression guard: adding the pickedUpAt branch must not disturb the
    // existing, separately-tested visibility contract.
    const presentation = read("features/portal/lib/workOrderPresentation.ts");
    expect(presentation).toContain(
      'CUSTOMER_HIDDEN_STATES = new Set(["canceled", "cancelled"])',
    );
  });

  it("adds a canonical awaiting_pickup stage between ready and closed", () => {
    const index = (stage: string) =>
      CANONICAL_WORK_ORDER_OPERATIONAL_STAGES.indexOf(stage as never);
    expect(index("awaiting_pickup")).toBeGreaterThan(index("ready"));
    expect(index("awaiting_pickup")).toBeLessThan(index("closed"));
    expect(WORK_ORDER_OPERATIONAL_STAGE_LABELS.awaiting_pickup).toBe(
      "Awaiting pickup",
    );
    expect(normalizeWorkOrderOperationalStage("invoiced")).toBe(
      "awaiting_pickup",
    );
    expect(normalizeWorkOrderOperationalStage("picked_up")).toBe("closed");
  });

  it("keeps the board's overall_stage CASE consistent with the new stage: invoiced without pickup is awaiting_pickup, picked up is closed", () => {
    const view = read(
      "supabase/migrations/20260928030000_board_awaiting_pickup_stage.sql",
    );
    expect(view).toContain("when w.picked_up_at is not null then 'closed'");
    expect(view).toContain(
      "when lower(coalesce(w.status::text, '')) = 'invoiced' then 'awaiting_pickup'",
    );
    expect(view).toContain("when 'awaiting_pickup' then 'Awaiting pickup'");
    expect(view).toContain("when 'awaiting_pickup' then 'Ready for pickup'");
  });

  it("defines the pickup RPC with the same authorization roles as archive, excluding technicians", () => {
    const migration = read(
      "supabase/migrations/20260928010000_work_order_vehicle_pickup.sql",
    );
    expect(migration).toContain(
      "create or replace function public.mark_work_order_picked_up_atomic(",
    );
    expect(migration).toContain(
      "'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',",
    );
    expect(migration).not.toContain("'mechanic'");
    expect(migration).not.toContain("'technician'");

    // Work completed, invoice paid, and pickup are three separate events:
    // the RPC gates on repair/invoice readiness and requires an explicit,
    // reasoned override to release an unpaid vehicle rather than silently
    // treating it as paid.
    expect(migration).toContain(
      "not in ('completed', 'ready_to_invoice', 'invoiced') then",
    );
    expect(migration).toContain("PICKUP_UNPAID_BALANCE_REQUIRES_OVERRIDE");
    expect(migration).toContain("PICKUP_RELEASE_REASON_REQUIRED");
    expect(migration).toContain("PICKUP_WORK_ORDER_ARCHIVED");

    // Idempotent re-confirmation, mirroring archive_work_order_atomic.
    expect(migration).toContain("'idempotent', true,");

    // Confirming pickup never touches invoice/payment fields directly.
    expect(migration).not.toContain("payment_status =");
    expect(migration).not.toContain("invoice_total =");
  });

  it("requires a reason to reverse a pickup confirmation and logs both events to the timeline", () => {
    const migration = read(
      "supabase/migrations/20260928010000_work_order_vehicle_pickup.sql",
    );
    expect(migration).toContain(
      "create or replace function public.reverse_work_order_pickup_atomic(",
    );
    expect(migration).toContain("PICKUP_REVERSAL_REASON_REQUIRED");
    expect(migration).toContain("PICKUP_NOT_CONFIRMED");
    expect(migration).toContain("'work_order_picked_up',");
    expect(migration).toContain("'work_order_pickup_reversed',");
  });

  it("guards pickup state behind a write-boundary trigger like archived_at", () => {
    const migration = read(
      "supabase/migrations/20260928010000_work_order_vehicle_pickup.sql",
    );
    expect(migration).toContain("WORK_ORDER_PICKUP_DIRECT_WRITE");
    expect(migration).toContain("app.work_order_pickup_writing");
  });

  it("syncs pickup into history independently of the paid trigger, without clobbering payment fields", () => {
    const migration = read(
      "supabase/migrations/20260928020000_history_sync_on_pickup.sql",
    );
    expect(migration).toContain(
      "create trigger trg_sync_picked_up_work_order_history",
    );
    expect(migration).toContain(
      "when (new.picked_up_at is not null and old.picked_up_at is null)",
    );
    expect(migration).toContain(
      "when coalesce(historical_status, '') = 'paid' then 'paid'",
    );
  });

  it("exposes mark-picked-up and reverse-pickup routes gated on canManageWorkOrders", () => {
    const markRoute = read(
      "app/api/work-orders/[id]/mark-picked-up/route.ts",
    );
    const reverseRoute = read(
      "app/api/work-orders/[id]/reverse-pickup/route.ts",
    );
    expect(markRoute).toContain('requiredCapability: "canManageWorkOrders"');
    expect(markRoute).toContain("mark_work_order_picked_up_atomic");
    expect(reverseRoute).toContain(
      'requiredCapability: "canManageWorkOrders"',
    );
    expect(reverseRoute).toContain("reverse_work_order_pickup_atomic");
  });

  it("drives every pickup-confirming surface through the same shared modal component", () => {
    const workspace = read("app/work-orders/[id]/Client.tsx");
    const list = read("features/work-orders/app/work-orders/view/page.tsx");
    const invoice = read(
      "features/work-orders/components/InvoicePreviewPageClient.tsx",
    );
    const billing = read("app/billing/page.tsx");

    for (const surface of [workspace, list, invoice, billing]) {
      expect(surface).toContain(
        '@/features/work-orders/components/workorders/MarkAsPickedUpModal',
      );
    }
  });

  it("keeps the invoice screen from offering pickup on a draft invoice", () => {
    const invoice = read(
      "features/work-orders/components/InvoicePreviewPageClient.tsx",
    );
    expect(invoice).toContain("activeInvoiceVersion &&");
    expect(invoice).toContain("!pickupInfo.pickedUpAt ? (");
    expect(invoice).toContain("Mark as Picked Up");
  });

  it("keeps the Work Orders list default view showing invoiced-but-unpicked-up orders without widening the shared active-status contract", () => {
    const list = read("features/work-orders/app/work-orders/view/page.tsx");
    expect(list).toContain("and(status.eq.invoiced,picked_up_at.is.null)");
    // The shared canonical "open repair" contract other surfaces rely on
    // (e.g. countActiveWorkOrders) stays untouched - broadened only via this
    // page's own OR clause, not by adding 'invoiced' to the shared set.
    expect(ACTIVE_WORK_ORDER_STATUSES).not.toContain("invoiced");
  });

  it("populates history.symptom on the pickup-created row, matching the paid trigger's own complaint/description aggregation", () => {
    const migration = read(
      "supabase/migrations/20260928070000_pickup_history_symptom_parity.sql",
    );
    expect(migration).toContain(
      "create or replace function public.sync_picked_up_work_order_history()",
    );
    expect(migration).toContain("v_symptoms text;");
    expect(migration).toContain(
      "nullif(pg_catalog.btrim(wol.complaint), ''),\n        nullif(pg_catalog.btrim(wol.description), '')",
    );
    // symptom is written on the pickup-created insert, alongside cause/correction.
    expect(migration).toMatch(/odometer,\s*\n\s*symptom,\s*\n\s*cause,/);
    expect(migration).toMatch(/v_odometer,\s*\n\s*v_symptoms,\s*\n\s*v_causes,/);
  });

  it("sweeps abandoned (never-linked) receipt uploads instead of leaving them in storage indefinitely", () => {
    const server = read(
      "features/invoices/server/expireAbandonedReceiptAttachments.ts",
    );
    const route = read(
      "app/api/internal/payments/expire-stale-receipts/route.ts",
    );
    const vercelConfig = read("vercel.json");

    expect(server).toContain('.is("payment_event_id", null)');
    // The delete is guarded the same way, so a receipt linked to a real
    // payment between select and delete is never removed from storage.
    expect(server).toContain('.is("payment_event_id", null)\n        .select("id")');
    expect(server).toContain("storage");
    expect(route).toContain("requireInternalApiSecret");
    expect(route).toContain("expireAbandonedReceiptAttachments");
    expect(vercelConfig).toContain("/api/internal/payments/expire-stale-receipts");
  });

  it("adds receipt capture to manual POS payments, linked to the payment event rather than a generic attachment", () => {
    const component = read(
      "features/invoices/components/RecordManualPayment.tsx",
    );
    const route = read("app/api/payments/manual/route.ts");
    const migration = read(
      "supabase/migrations/20260928040000_payment_receipt_attachments.sql",
    );

    expect(component).toContain('accept="image/*,application/pdf"');
    expect(component).toContain('.from("payment-receipts")');
    expect(route).toContain("receiptStoragePath");
    expect(route).toContain("payment_receipt_attachments");
    expect(migration).toContain("payment_event_id uuid references public.payment_events(id)");
    expect(migration).toContain("uq_payment_receipt_attachments_client_mutation");
  });

  it("lets mark_work_order_picked_up_atomic's own write through the financial-lock guard instead of raising WORK_ORDER_FINANCIALLY_LOCKED", () => {
    // mark_work_order_picked_up_atomic requires status in ('completed',
    // 'ready_to_invoice', 'invoiced'), but 'invoiced' is exactly the status
    // that trips work_order_is_financially_locked, so without an exemption
    // for the RPC's own write-boundary flag, guard_financially_locked_
    // work_order rejected the pickup update before the RPC could ever return
    // successfully on an already-invoiced work order - the normal case. The
    // guard trusts the exact same app.work_order_pickup_writing flag the
    // write-boundary trigger already trusts, rather than a static allow-list
    // of column names, so the exemption is scoped to that one already-
    // reviewed RPC's own transaction instead of any future write to those
    // columns. Runtime behavior (RPC succeeds and reverses cleanly on a
    // locked work order; a raw write bypassing the RPC, and an ordinary
    // operational field, are both still rejected) is exercised in
    // tests/security/vehicle-pickup-financial-lock.runtime.sql.
    const migration = read(
      "supabase/migrations/20260929010000_allow_vehicle_pickup_after_financial_lock.sql",
    );
    expect(migration).toContain(
      "create or replace function public.guard_financially_locked_work_order()",
    );
    expect(migration).toContain(
      "if coalesce(current_setting('app.work_order_pickup_writing', true), '0') = '1' then",
    );
    // The prior allow-list (invoice-delivery metadata) must stay intact and
    // unexpanded - the pickup columns are exempted by the write-boundary
    // flag, not added here.
    expect(migration).toContain("'invoice_sent_at',");
    expect(migration).toContain("'invoice_url',");
    expect(migration).not.toContain("'picked_up_at',");
    expect(migration).not.toContain("'collected_by_type',");

    const runtimeTest = read(
      "tests/security/vehicle-pickup-financial-lock.runtime.sql",
    );
    expect(runtimeTest).toContain("mark_work_order_picked_up_atomic(");
    expect(runtimeTest).toContain("reverse_work_order_pickup_atomic(");
    expect(runtimeTest).toContain("work_order_is_financially_locked(");
    expect(runtimeTest).toContain(
      "Regression: a direct write to picked_up_at outside mark_work_order_picked_up_atomic must be rejected",
    );
    expect(runtimeTest).toContain(
      "Regression: an ordinary operational field must still be rejected",
    );

    const workflow = read(
      ".github/workflows/supabase-clean-replay-audit.yml",
    );
    expect(workflow).toContain(
      "tests/security/vehicle-pickup-financial-lock.runtime.sql",
    );
  });
});
