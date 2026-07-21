import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobilePage = readFileSync("app/mobile/assistant/page.tsx", "utf8");
const desktopPage = readFileSync("app/assistant/page.tsx", "utf8");
const hookSource = readFileSync(
  "features/shop-assistant/hooks/useShopAssistant.ts",
  "utf8",
);
const storeSource = readFileSync(
  "features/shop-assistant/server/threadStore.ts",
  "utf8",
);
const actorSource = readFileSync(
  "features/shop-assistant/server/requireShopAssistantActor.ts",
  "utf8",
);
const chatRoute = readFileSync("app/api/shop-assistant/chat/route.ts", "utf8");
const diagnosticBoundary = readFileSync(
  "features/shop-assistant/server/orchestrator/agents/diagnosticBoundaryAgent.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260721180000_shop_assistant_threads_actions.sql",
  "utf8",
);
const techHook = readFileSync("features/ai/hooks/useTechAssistant.ts", "utf8");

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe("shop assistant reliability contracts", () => {
  it("renders each mobile turn through one canonical transcript path", () => {
    expect(mobilePage).toContain("ShopAssistantConversation");
    expect(occurrences(mobilePage, "<ShopAssistantConversation")).toBe(1);
    expect(mobilePage).not.toContain("AssistantResponseCard");
    expect(mobilePage).not.toContain("useAssistant(");
  });

  it("uses the durable shop assistant hook on desktop and mobile", () => {
    expect(mobilePage).toContain("useShopAssistant");
    expect(desktopPage).toContain("useShopAssistant");
    expect(hookSource).toContain("/api/shop-assistant/threads");
    expect(hookSource).toContain("/api/shop-assistant/chat");
    expect(hookSource).toContain("mergeMessages");
  });

  it("deduplicates optimistic messages and retries with the same client id", () => {
    expect(hookSource).toContain("serverClientIds");
    expect(hookSource).toContain("retryRequest");
    expect(hookSource).toContain("await sendRequest(retryRequest)");
    expect(storeSource).toContain('error?.code !== "23505"');
    expect(storeSource).toContain("client_message_id: clientMessageId");
  });

  it("persists bounded conversation history and correlates one reply per request", () => {
    expect(chatRoute).toContain("requestClientMessageId");
    expect(chatRoute).toContain("findAssistantReply");
    expect(chatRoute).toContain("loadShopAssistantMessages");
    expect(chatRoute).toContain("conversationMessages(storedMessages)");
  });

  it("enforces shop ownership and durable idempotency in the database", () => {
    expect(migration).toContain("shop_assistant_messages_client_id_uidx");
    expect(migration).toContain("shop_assistant_actions_idempotency_uidx");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("t.user_id = auth.uid()");
    expect(migration).toContain("p.shop_id = shop_assistant_threads.shop_id");
  });

  it("keeps technician diagnostics isolated inside the existing work-order assistant", () => {
    expect(actorSource).toContain('canonicalRole === "mechanic"');
    expect(chatRoute).toContain("orchestrateShopAssistantTurn");
    expect(diagnosticBoundary).toContain("Technician AI");
    expect(diagnosticBoundary).toContain("allowedTools: []");
    expect(techHook).toContain('postJSON("/api/assistant/answer"');
    expect(techHook).not.toContain("/api/shop-assistant/chat");
  });
});
