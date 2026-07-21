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

  it("routes explicit mutations before the legacy informational answer path", () => {
    expect(directIntent).toContain('toolName: "hold_work_order"');
    expect(directIntent).toContain('toolName: "release_work_order_hold"');
    expect(directIntent).toContain('toolName: "assign_work_order"');
    expect(directIntent).toContain('toolName: "reschedule_booking"');
    expect(directIntent).toContain('toolName: "send_conversation_message"');
    expect(chatRoute.indexOf("routeDirectToolIntent")).toBeLessThan(
      chatRoute.indexOf("answerAssistant({"),
    );
  });

  it("requires a durable confirmation before every registered write executes", () => {
    expect(directIntent).toContain("previewShopAssistantWriteTool");
    expect(directIntent).toContain("createPendingAction");
    expect(actionStore).toContain('status: "pending_confirmation"');
    expect(confirmRoute).toContain("acquireActionExecution");
    expect(confirmRoute).toContain("executeShopAssistantWriteTool");
  });

  it("uses idempotency and terminal result replay for safe action execution", () => {
    expect(actionStore).toContain("idempotency_key");
    expect(actionStore).toContain('error?.code !== "23505"');
    expect(confirmRoute).toContain('acquired.row.status === "executing"');
    expect(confirmRoute).toContain("mapActionResult");
    expect(cancelRoute).toContain("cancelAction");
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
    expect(chatRoute).toContain("technicianRedirectAnswer");
  });
});
