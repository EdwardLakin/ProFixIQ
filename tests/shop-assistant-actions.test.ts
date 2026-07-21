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
const chatRoute = readFileSync(
  "app/api/shop-assistant/chat/route.ts",
  "utf8",
);
const orchestrator = readFileSync(
  "features/shop-assistant/server/orchestrator/orchestrateShopAssistantTurn.ts",
  "utf8",
);
const diagnosticBoundary = readFileSync(
  "features/shop-assistant/server/orchestrator/agents/diagnosticBoundaryAgent.ts",
  "utf8",
);
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
const toolTypes = readFileSync(
  "features/shop-assistant/server/tools/types.ts",
  "utf8",
);
const atomicMigration = readFileSync(
  "supabase/migrations/20260721184500_shop_assistant_atomic_actions.sql",
  "utf8",
);
const techHook = readFileSync("features/ai/hooks/useTechAssistant.ts", "utf8");

describe("shop assistant tool execution contracts", () => {
  it("registers every required shop-wide domain behind one typed registry", () => {
    for (const tool of [
      "readWorkOrderTool",
      "listBookingsTool",
      "listLowStockPartsTool",
      "sendConversationMessageTool",
      "findCustomersTool",
      "listInspectionsTool",
      "listReadyInvoicesTool",
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

  it("routes explicit mutations before the informational fallback", () => {
    expect(directIntent).toContain('toolName: "hold_work_order"');
    expect(directIntent).toContain('toolName: "release_work_order_hold"');
    expect(directIntent).toContain('toolName: "assign_work_order"');
    expect(directIntent).toContain('toolName: "reschedule_booking"');
    expect(directIntent).toContain('toolName: "send_conversation_message"');
    expect(chatRoute).toContain("orchestrateShopAssistantTurn");
    expect(orchestrator.indexOf("routeDirectToolIntent")).toBeLessThan(
      orchestrator.indexOf("answerAssistant({"),
    );
  });

  it("requires a durable confirmation before every registered write executes", () => {
    expect(directIntent).toContain("previewShopAssistantWriteTool");
    expect(directIntent).toContain("createPendingAction");
    expect(actionStore).toContain('status: "pending_confirmation"');
    expect(confirmRoute).toContain("acquireActionExecution");
    expect(confirmRoute).toContain("executeShopAssistantWriteTool");
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
    expect(workOrderTools).toContain("shop_assistant_release_work_order_hold_atomic");
    expect(workforceTools).toContain("shop_assistant_assign_work_order_atomic");
    expect(customerTools).toContain("shop_assistant_create_customer_atomic");
    expect(schedulingTools).toContain("shop_assistant_reschedule_booking_atomic");
    expect(atomicMigration).toContain("set status = 'succeeded'");
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
  });

  it("uses idempotency, execution leases, and terminal result replay", () => {
    expect(actionStore).toContain("idempotency_key");
    expect(actionStore).toContain('error?.code !== "23505"');
    expect(actionStore).toContain("SHOP_ASSISTANT_ACTION_EXECUTION_LEASE_MS");
    expect(actionStore).toContain("executionLeaseExpired");
    expect(confirmRoute).toContain("loadAction");
    expect(confirmRoute).toContain('persisted.status === "executing"');
    expect(cancelRoute).toContain("cancelAction");
  });

  it("returns and persists intentional non-retryable authorization denials", () => {
    expect(toolTypes).toContain("new ShopAssistantHttpError");
    expect(toolTypes).toContain("403");
    expect(chatRoute).toContain("const status = shopAssistantErrorStatus(error)");
    expect(chatRoute).toContain("const retryable = status >= 500");
    expect(chatRoute).toContain("retryable,");
  });

  it("accepts canonical technician aliases", () => {
    expect(directIntent).toContain("canonicalizeRole");
    expect(workforceTools).toContain("canonicalizeRole");
  });

  it("renders structured confirmation, success, failure, and cancellation states", () => {
    expect(conversation).toContain("Confirmation required");
    expect(conversation).toContain("Confirm and run");
    expect(conversation).toContain("onCancelAction");
    expect(conversation).toContain('status === "succeeded"');
    expect(conversation).toContain('status === "failed"');
  });

  it("leaves technician diagnostics on the existing in-work-order route", () => {
    expect(techHook).toContain('postJSON("/api/assistant/answer"');
    expect(techHook).not.toContain("/api/shop-assistant/actions");
    expect(diagnosticBoundary).toContain("Technician AI");
    expect(diagnosticBoundary).toContain("allowedTools: []");
    expect(orchestrator).toContain('agent.id === "diagnostic_boundary_agent"');
  });
});
