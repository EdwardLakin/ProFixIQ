import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("onboarding session proxy contract", () => {
  it("session creation route includes shopId and source system in outbound body", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/onboarding-v2/sessions/route.ts"), "utf8");
    expect(route.includes('JSON.stringify({ shopId, ...parsed.data })')).toBe(true);
    expect(route.includes('path: "/onboarding/sessions"')).toBe(true);
  });

  it("proxy client signs outbound request and includes required headers", () => {
    const client = fs.readFileSync(path.join(process.cwd(), "features/onboarding-v2/server/agentClient.ts"), "utf8");
    expect(client.includes("signOnboardingAgentPayload")).toBe(true);
    expect(client.includes('"x-shop-id": input.shopId')).toBe(true);
    expect(client.includes('"x-onboarding-agent-timestamp"')).toBe(true);
    expect(client.includes('"x-onboarding-agent-signature"')).toBe(true);
  });

  it("session creation route returns safe upstream error details", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/onboarding-v2/sessions/route.ts"), "utf8");
    expect(route.includes("failureKind")).toBe(true);
    expect(route.includes("upstreamStatus")).toBe(true);
    expect(route.includes("raw_data")).toBe(false);
  });
});

it("agent diagnostics route asserts upstream service contract", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/onboarding-v2/agent-diagnostics/route.ts"), "utf8");
  expect(route.includes('path: "/health"')).toBe(true);
  expect(route.includes('path: "/health/ready"')).toBe(true);
  expect(route.includes('service === "profixiq-onboarding-agent"')).toBe(true);
});
