import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registry = readFileSync(
  "features/shop-assistant/server/tools/registry.ts",
  "utf8",
);
const directIntent = readFileSync(
  "features/shop-assistant/server/actions/directToolIntent.ts",
  "utf8",
);
const actionStore = readFileSync(
  "features/shop-assistant/server/actions/actionStore.ts",
  "utf8",
);
const chatRoute = readFileSync("app/api/shop-assistant/chat/route.ts", "utf8");
const confirmRoute = readFileSync(
  "app/api/shop-assistant/actions/[actionId]/confirm/route.ts",
  "utf8",
);
const cancelRoute = readFileSync(
  "app/api/shop-assistant/actions/[actionId]/cancel/route.ts",
  "utf8",
);
const conversation = readFileSync(
  "features/shop-assistant/components/ShopAssistantConversation.tsx",
  "utf8",
);
const workOrderTools = readFileSync(
  "features/shop-assistant/server/tools/domains/workOrders.ts",
  "utf8",
);
const workforceTools = readFileSync(
  "features/shop-assistant/server/tools/domains/workforce.ts",
  "utf8",
);
const customerTools = readFileSync(
  "features/shop-assistant/server/tools/domains/customers.ts",
  "utf8",
);
const schedulingTools = readFileSync(
  "features/shop-assistant/server/tools/domains/scheduling.ts",
  "utf8",
);
const inventoryTools = readFileSync(
  "features/shop-assistant/server/tools/domains/inventory.ts",
  "utf8",
);
const invoiceTools = readFileSync(
  "features/shop-assistant/server/tools/domains/invoices.ts",
  "utf8",
);
const inspectionTools = readFileSync(
  "features/shop-assistant/server/tools/domains/inspections.ts",
  "utf8",
);
const fleetTools = readFileSync(
  "features/shop-assistant/server/tools/domains/fleet.ts",
  "utf8",
);
const orchestrator = readFileSync(
  "features/shop-assistant/server/orchestrator/orchestrateShopAssistantTurn.ts",
  "utf8",
);
const toolTypes = readFileSync(
  "features/shop-assistant/server/tools/types.ts",
  "utf8",
);
const atomicMigration = readFileSync(
  "supabase/migrations/20260721184500_shop_assistant_atomic_actions.sql",
  "utf8",
);
const universalMigration = readFileSync(
  "supabase/migrations/20260816220000_shop_assistant_universal_actions.sql",
  "utf8",
);
const techHook = readFileSync("features/ai/hooks/useTechAssistant.ts", "utf8");
const technicianTools = readFileSync(
  "features/shop-assistant/server/tools/domains/technician.ts",
  "utf8",
);
const technicianChat = readFileSync(
  "features/copilot/technician/server/chat.ts",
  "utf8",
);
const pendingApprovals = readFileSync(
  "features/agent/tools/listPendingApprovals.ts",
  "utf8",
);

describe("shop assistant tool execution contracts", () => {
  it("registers every required shop-wide domain behind one typed registry", () => {
    for (const tool of [
      "readWorkOrderTool",
      "listBookingsTool",
      "listLowStockPartsTool",
      "listStockLocationsTool",
      "createInventoryPartTool",
      "setInventoryStockTool",
      "findSuppliersTool",
      "readPurchaseOrderTool",
      "createPurchaseOrderTool",
      "placePurchaseOrderTool",
      "receivePurchaseOrderLineTool",
      "sendConversationMessageTool",
      "findCustomersTool",
      "listInspectionsTool",
      "reopenInspectionTool",
      "listReadyInvoicesTool",
      "markWorkOrderReadyTool",
      "recordManualPaymentTool",
      "reverseManualPaymentTool",
      "listTechnicianLoadTool",
      "readShopStateTool",
      "readBusinessSnapshotTool",
    ]) {
      expect(registry).toContain(tool);
    }
    expect(registry).toContain("assertToolCapability");
    expect(registry).toContain("inputSchema.parse");
    expect(registry).toContain("outputSchema.parse");
  });

  it("routes explicit mutations before the legacy informational answer path", () => {
    expect(directIntent).toContain('toolName: "hold_work_order"');
    expect(directIntent).toContain('toolName: "release_work_order_hold"');
    expect(directIntent).toContain('toolName: "assign_work_order"');
    expect(directIntent).toContain('toolName: "reschedule_booking"');
    expect(directIntent).toContain('toolName: "send_conversation_message"');
    expect(directIntent).toContain(
      'toolName: "mark_work_order_ready_to_invoice"',
    );
    expect(directIntent).toContain('toolName: "record_manual_invoice_payment"');
    expect(directIntent).toContain(
      'toolName: "reverse_manual_invoice_payment"',
    );
    expect(chatRoute.indexOf("routeDirectToolIntent")).toBeLessThan(
      chatRoute.indexOf("answerAssistant({"),
    );
    expect(directIntent).toContain("shopLocalDateTimeToUtc");
    expect(directIntent).toContain("The shop timezone is invalid");
    expect(directIntent).toContain("Include an explicit UTC offset");
  });

  it("requires a durable confirmation before every registered write executes", () => {
    expect(directIntent).toContain("previewShopAssistantWriteTool");
    expect(directIntent).toContain("createPendingAction");
    expect(actionStore).toContain('status: "pending_confirmation"');
    expect(confirmRoute).toContain("acquireActionExecution");
    expect(confirmRoute).toContain("executeShopAssistantWriteTool");
  });

  it("keeps assistant-owned commands behind the trusted server boundary", () => {
    expect(toolTypes).toContain("runShopAssistantCommandRpc");
    expect(toolTypes).toContain("createAdminSupabase");
    for (const source of [
      customerTools,
      schedulingTools,
      inventoryTools,
      workOrderTools,
      workforceTools,
      fleetTools,
    ]) {
      if (source.includes("shop_assistant_")) {
        expect(source).toContain("runShopAssistantCommandRpc");
      }
    }
    expect(universalMigration).toContain("from public, anon, authenticated;");
    expect(universalMigration).not.toMatch(
      /grant execute on function public\.shop_assistant_[^;]+?to authenticated(?:,|;)/,
    );
    expect(universalMigration).toContain(") to service_role;");
  });

  it("commits representative shop mutations and terminal results atomically", () => {
    for (const rpcName of [
      "shop_assistant_hold_work_order_atomic",
      "shop_assistant_release_work_order_hold_atomic",
      "shop_assistant_assign_work_order_atomic",
      "shop_assistant_create_customer_atomic",
      "shop_assistant_reschedule_booking_atomic",
    ]) {
      expect(atomicMigration).toContain(`function public.${rpcName}`);
    }

    expect(workOrderTools).toContain("shop_assistant_hold_work_order_atomic");
    expect(workOrderTools).toContain(
      "shop_assistant_release_work_order_hold_atomic",
    );
    expect(workforceTools).toContain("shop_assistant_assign_work_order_atomic");
    expect(customerTools).toContain("shop_assistant_create_customer_atomic");
    expect(schedulingTools).toContain(
      "shop_assistant_reschedule_booking_atomic",
    );
    expect(atomicMigration).toContain("set status = 'succeeded'");
    for (const rpcName of [
      "shop_assistant_create_vehicle_atomic",
      "shop_assistant_create_work_order_atomic",
      "shop_assistant_add_work_order_line_atomic",
      "shop_assistant_create_booking_atomic",
      "shop_assistant_cancel_booking_atomic",
      "shop_assistant_create_part_request_atomic",
      "shop_assistant_receive_part_request_item_atomic",
      "shop_assistant_receive_purchase_order_line_atomic",
      "shop_assistant_record_approval_decision_atomic",
      "shop_assistant_finalize_invoice_atomic",
      "shop_assistant_mark_work_order_ready_atomic",
      "shop_assistant_reopen_inspection_atomic",
      "shop_assistant_create_inventory_part_atomic",
      "shop_assistant_set_inventory_stock_atomic",
      "shop_assistant_create_purchase_order_atomic",
      "shop_assistant_place_purchase_order_atomic",
      "shop_assistant_create_fleet_service_request_atomic",
      "shop_assistant_convert_fleet_service_request_atomic",
    ]) {
      expect(universalMigration).toContain(`function public.${rpcName}`);
    }
    expect(inventoryTools).toContain(
      "shop_assistant_create_inventory_part_atomic",
    );
    expect(inventoryTools).toContain(
      "shop_assistant_set_inventory_stock_atomic",
    );
    expect(inventoryTools).toContain(
      "shop_assistant_create_purchase_order_atomic",
    );
    expect(inventoryTools).toContain(
      "shop_assistant_place_purchase_order_atomic",
    );
    expect(inventoryTools).toContain("purchase_order_line_count:");
    expect(inventoryTools).toContain("purchase_order_supplier:");
    expect(inventoryTools).toContain(
      "shop_assistant_receive_purchase_order_line_atomic",
    );
    expect(invoiceTools).toContain("postPaymentEvent");
    expect(invoiceTools).toContain("manual_reversal");
    expect(invoiceTools).toContain("invoice_source:");
    expect(invoiceTools).toContain("invoice_snapshot:");
    expect(universalMigration).toContain(
      "shop_assistant_invoice_source_fingerprint",
    );
    expect(universalMigration).toContain(
      "shop_assistant_finalize_invoice_atomic",
    );
    expect(workOrderTools).toContain(
      "shop_assistant_mark_work_order_ready_atomic",
    );
    expect(workOrderTools).toContain("approval_item_count:");
    expect(workOrderTools).toContain("approval_quote_line:");
    expect(workOrderTools).toContain("approval_work_order_line:");
    expect(universalMigration).toContain(
      "The pending approval set changed after the confirmation preview.",
    );
    expect(universalMigration).toContain(
      "shop_assistant_timestamp_version_matches(\n        v_action.target_versions ->> ('approval_quote_line:'",
    );
    expect(inspectionTools).toContain(
      '"shop_assistant_reopen_inspection_atomic"',
    );
    expect(fleetTools).toContain(
      "shop_assistant_create_fleet_service_request_atomic",
    );
    expect(fleetTools).toContain(
      "shop_assistant_convert_fleet_service_request_atomic",
    );
  });

  it("receives only the exact purchase-order line that was confirmed", () => {
    expect(inventoryTools).not.toContain("receive_po_part_and_allocate");
    expect(universalMigration).toContain("'receive_purchase_order_line'");
    expect(universalMigration).toContain("line.id = p_purchase_order_line_id");
    expect(universalMigration).toContain(
      "coalesce(v_line.qty, 0) - coalesce(v_line.cancelled_qty, 0)",
    );
    expect(universalMigration).toContain(
      "purchase_order_line_id\n    ) values",
    );
    expect(universalMigration).toContain(":shop-assistant:po-line-receive:");
    expect(universalMigration).toContain(
      "More than one PO line matches this request item",
    );
    expect(universalMigration).toContain(
      "v_line.unit_cost,\n    p_shop_id::text",
    );
  });

  it("fails closed around work-order lifecycle and active technician work", () => {
    expect(workOrderTools).toContain("HOLDABLE_WORK_ORDER_STATUSES");
    expect(workOrderTools).toContain('"active"');
    expect(atomicMigration).toContain("work_order_is_financially_locked");
    expect(atomicMigration).toContain("seg.ended_at is null");
    expect(atomicMigration).toContain("wol.punched_out_at is null");
    expect(atomicMigration).toContain(
      "Only active operational work orders can be placed on hold.",
    );
    expect(universalMigration).toContain("shop_assistant_assert_line_snapshot");
    expect(universalMigration).toContain(
      "shop_assistant_timestamp_version_matches",
    );
    expect(universalMigration).toContain("when p_expected = 'missing'");
    expect(universalMigration).toContain("line.voided_at is null");
    expect(workOrderTools).toContain("work_order_line_count:");
    expect(workOrderTools).toContain('row.updated_at ?? "missing"');
    expect(workforceTools).toContain("TERMINAL_ASSIGNMENT_STATUSES");
  });

  it("uses canonical identities and scheduling state for confirmed writes", () => {
    expect(universalMigration).toContain(
      "select candidate.id, p_technician_id, v_actor_profile_id",
    );
    expect(universalMigration).toContain(
      "scheduler_apply_booking_command_atomic",
    );
    expect(universalMigration).toContain(
      "p_starts_at + (v_booking.ends_at - v_booking.starts_at)",
    );
    expect(universalMigration).toContain(
      "when line.line_kind = 'diagnostic' then 'diagnosis'",
    );
  });

  it("binds mechanic actions to the exact confirmed assigned job", () => {
    expect(technicianTools).toContain("technician_work_order_line:");
    expect(technicianTools).toContain("requiredWorkOrderLineUpdatedAt");
    expect(technicianChat).toContain("confirmed-target-anchor");
    expect(technicianChat).toContain(
      "technician_copilot_confirmed_target_conflict",
    );
  });

  it("paginates approvals and suppresses every quote-linked legacy line", () => {
    expect(pendingApprovals).toContain("linkedLegacyLineIds");
    expect(pendingApprovals).toContain(".range(from, from + 499)");
    expect(pendingApprovals).not.toContain(".limit(400)");
  });

  it("uses idempotency, execution leases, and terminal result replay", () => {
    expect(actionStore).toContain("idempotency_key");
    expect(actionStore).toContain(
      "That request id is already bound to a different shop action.",
    );
    expect(actionStore).toContain("sameJson(existingRow.input, params.input)");
    expect(actionStore).toContain('error?.code !== "23505"');
    expect(actionStore).toContain("SHOP_ASSISTANT_ACTION_EXECUTION_LEASE_MS");
    expect(actionStore).toContain("executionLeaseExpired");
    expect(confirmRoute).toContain("loadAction");
    expect(confirmRoute).toContain('persisted.status === "executing"');
    expect(cancelRoute).toContain("cancelAction");
    expect(actionStore).toContain("isRetryableFailedAction");
    expect(actionStore).toContain("actionWriteDb");
    expect(conversation).toContain("Retry action");
    expect(universalMigration).toContain("shop_assistant_guard_action_insert");
    expect(universalMigration).toContain(
      "revoke insert, update on table public.shop_assistant_actions",
    );
    expect(universalMigration).toContain("old.error ->> 'retryable' = 'true'");
    expect(invoiceTools).toContain("loadExistingPaymentOperation");
    expect(invoiceTools).toContain("invoice_work_order:");
  });

  it("returns intentional authorization denials and accepts technician aliases", () => {
    expect(toolTypes).toContain("new ShopAssistantHttpError");
    expect(toolTypes).toContain("403");
    expect(directIntent).toContain("canonicalizeRole");
    expect(workforceTools).toContain("canonicalizeRole");
  });

  it("renders structured confirmation, success, failure, and cancellation states", () => {
    expect(conversation).toContain("Confirmation required");
    expect(conversation).toContain("Confirm and run");
    expect(conversation).toContain("onCancelAction");
    expect(conversation).toContain('status === "succeeded"');
    expect(conversation).toContain('status === "failed"');
    expect(conversation).toContain("ClarificationForm");
    expect(conversation).toContain("onSubmitPrompt");
    expect(conversation).toContain("originalRequest");
  });

  it("leaves technician diagnostics on the existing in-work-order route", () => {
    expect(techHook).toContain('postJSON("/api/assistant/answer"');
    expect(techHook).not.toContain("/api/shop-assistant/actions");
    expect(chatRoute).toContain("orchestrateShopAssistantTurn");
    expect(orchestrator).toContain('kind: "technician_delegate"');
    expect(registry).toContain("requestTechnicianCopilotTool");
  });
});
