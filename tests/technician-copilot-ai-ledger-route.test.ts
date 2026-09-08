import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "app/api/copilot/technician/chat/route.ts",
  "utf8",
);

const structured = readFileSync(
  "features/shared/lib/server/openai-structured.ts",
  "utf8",
);

describe("technician CoPilot durable AI attribution", () => {
  it("scopes nested CoPilot model calls to authenticated shop/profile identity", () => {
    expect(route).toContain("withAITelemetryContext");
    expect(route).toContain("shopId: access.shopId");
    expect(route).toContain("userId: access.profileId");
    expect(route).toContain('endpoint: "/api/copilot/technician/chat"');
  });

  it("captures cached input and provider response identity from Responses API", () => {
    expect(structured).toContain("cachedPromptTokens");
    expect(structured).toContain('"cached_tokens"');
    expect(structured).toContain("provider_request_id");
    expect(structured).toContain("currentAITelemetryContext");
  });
});
