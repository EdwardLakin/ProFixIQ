import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyShopAssistantIntent } from "@/features/assistant/server/shopAssistantIntent";
import {
  dedupeAssistantBullets,
  dedupeAssistantText,
} from "@/features/assistant/lib/assistantText";

const read = (path: string) => readFileSync(path, "utf8");

describe("shop assistant reliability", () => {
  it("classifies a work-order hold command before informational routing", () => {
    const intent = classifyShopAssistantIntent(
      "Put EL00005 on hold for parts",
    );

    expect(intent.kind).toBe("action");
    if (intent.kind !== "action") return;
    expect(intent.toolName).toBe("set_work_order_hold");
    expect(intent.input).toEqual({
      workOrderReference: "EL00005",
      reason: "Awaiting parts",
    });
  });

  it("does not mistake a hold-status question for a mutation", () => {
    expect(
      classifyShopAssistantIntent("Which work orders are on hold right now?"),
    ).toEqual({ kind: "query" });
  });

  it("keeps unsupported action requests out of the informational answer path", () => {
    const intent = classifyShopAssistantIntent(
      "Email every customer whose vehicle is ready",
    );
    expect(intent.kind).toBe("clarification");
  });

  it("removes repeated answer text and summary-equivalent bullets", () => {
    const summary = dedupeAssistantText(
      "I found 3 stale work orders. I found 3 stale work orders.",
    );
    expect(summary).toBe("I found 3 stale work orders.");
    expect(
      dedupeAssistantBullets(summary, [
        "I found 3 stale work orders.",
        "WO #EL00003 is queued.",
        "WO #EL00003 is queued.",
      ]),
    ).toEqual(["WO #EL00003 is queued."]);
  });

  it("persists conversations and gates writes behind confirmation", () => {
    const migration = read(
      "supabase/migrations/20260721100000_shop_assistant_reliability.sql",
    );
    expect(migration).toContain("create table if not exists public.assistant_conversations");
    expect(migration).toContain("create table if not exists public.assistant_messages");
    expect(migration).toContain("create table if not exists public.assistant_action_requests");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("assistant_set_work_order_hold");

    const answerRoute = read("app/api/assistant/answer/route.ts");
    expect(answerRoute).toContain('body.surface === "shop"');
    expect(answerRoute).toContain("handleShopAssistantRequest");

    const actionRoute = read("app/api/assistant/actions/[id]/route.ts");
    expect(actionRoute).toContain('decision !== "confirm"');
    expect(actionRoute).toContain('expectedStatus: "pending"');
  });
});
