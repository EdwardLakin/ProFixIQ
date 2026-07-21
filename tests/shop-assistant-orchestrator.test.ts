import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registry = readFileSync(
  "features/shop-assistant/server/orchestrator/agentRegistry.ts",
  "utf8",
);
const orchestrator = readFileSync(
  "features/shop-assistant/server/orchestrator/orchestrateShopAssistantTurn.ts",
  "utf8",
);
const classifier = readFileSync(
  "features/shop-assistant/server/orchestrator/intentClassifier.ts",
  "utf8",
);
const stateAnswer = readFileSync(
  "features/shop-assistant/server/orchestrator/stateGroundedAnswer.ts",
  "utf8",
);
const stateCache = readFileSync(
  "features/shop-assistant/server/state/shopStateCache.ts",
  "utf8",
);
const stateRoute = readFileSync(
  "app/api/shop-assistant/state/route.ts",
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
const conversation = readFileSync(
  "features/shop-assistant/components/ShopAssistantConversation.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260721190000_shop_assistant_state_snapshots.sql",
  "utf8",
);
const diagnosticBoundary = readFileSync(
  "features/shop-assistant/server/orchestrator/agents/diagnosticBoundaryAgent.ts",
  "utf8",
);
const techHook = readFileSync("features/ai/hooks/useTechAssistant.ts", "utf8");

describe("shop assistant orchestration contracts", () => {
  it("registers specialized agents for every shop-wide operating domain", () => {
    for (const agent of [
      "workOrdersAgent",
      "schedulingAgent",
      "inventoryAgent",
      "customerCommunicationsAgent",
      "customersAgent",
      "inspectionsAgent",
      "invoicesAgent",
      "workforceAgent",
      "reportingAgent",
      "businessAnalyticsAgent",
      "diagnosticBoundaryAgent",
    ]) {
      expect(registry).toContain(agent);
    }
  });

  it("keeps technician diagnostics inside the existing work-order assistant", () => {
    expect(diagnosticBoundary).toContain("Technician AI");
    expect(diagnosticBoundary).toContain("allowedTools: []");
    expect(techHook).toContain('postJSON("/api/assistant/answer"');
    expect(techHook).not.toContain("orchestrateShopAssistantTurn");
  });

  it("routes every shop turn through the central orchestrator", () => {
    expect(chatRoute).toContain("orchestrateShopAssistantTurn");
    expect(chatRoute).not.toContain('from "@/features/agent/assistant/server/answerAssistant"');
    expect(chatRoute).not.toContain("routeDirectToolIntent({");
    expect(orchestrator).toContain("routeDirectToolIntent");
    expect(orchestrator).toContain("answerAssistant");
  });

  it("tries registered tools before refusing an unsupported mutation", () => {
    expect(orchestrator.indexOf("routeDirectToolIntent")).toBeLessThan(
      orchestrator.indexOf('kind: "unsupported_action"'),
    );
    expect(orchestrator).toContain("No shop record was changed");
    expect(classifier).toContain('"put"');
    expect(classifier).toContain('"place"');
    expect(classifier).toContain("isActionLikeQuestion");
  });

  it("routes cross-domain summaries to reporting and grounds them in live state", () => {
    expect(classifier).toContain("isCrossDomainSummary");
    expect(classifier).toContain('agentId: "reporting_agent"');
    expect(orchestrator).toContain("buildStateGroundedAnswer");
    expect(stateAnswer).toContain("metrics.openWorkOrders");
    expect(stateAnswer).toContain("Needs attention:");
    expect(stateAnswer).toContain("Recommended next moves:");
  });

  it("maintains a short-lived actor-scoped shop state snapshot", () => {
    expect(migration).toContain("shop_assistant_state_snapshots");
    expect(migration).toContain("primary key (shop_id, user_id)");
    expect(migration).toContain("enable row level security");
    expect(stateCache).toContain("DEFAULT_TTL_MS = 30_000");
    expect(stateCache).toContain("buildShopState");
    expect(stateCache).toContain("existingState");
    expect(stateRoute).toContain("getOrRefreshShopState");
    expect(stateRoute).toContain('searchParams.get("refresh") === "1"');
  });

  it("invalidates the current actor snapshot after a successful action", () => {
    expect(confirmRoute).toContain('finalRow.status === "succeeded"');
    expect(confirmRoute).toContain("invalidateShopState(actor)");
  });

  it("closes old confirmation controls after a terminal result arrives", () => {
    expect(conversation).toContain("terminalActionIds");
    expect(conversation).toContain("actionFinished");
    expect(conversation).toContain("!actionFinished");
  });
});
