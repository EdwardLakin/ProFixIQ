import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc }),
}));

import { POST } from "../app/api/internal/agent/approval-intents/consume/route";
import { isAgentApiRequestAuthorized } from "@/features/shared/lib/server/agent-api-secrets";

const approvalProof = "A".repeat(43);
const approverUserId = "cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c";
const engineeringCaseId = "a2d023e1-704b-4069-bada-5635fcbcf4f4";
const missionId = "694f5648-c5db-4b73-82a9-fc10e40c93e3";
const originalEnvironment = {
  AGENT_API_SECRET: process.env.AGENT_API_SECRET,
  PROFIXIQ_AGENT_API_SECRET: process.env.PROFIXIQ_AGENT_API_SECRET,
  INTERNAL_AGENT_SECRET: process.env.INTERNAL_AGENT_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function request(body: unknown, secret?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("x-agent-api-secret", secret);
  return new Request("https://profixiq.test/api/internal/agent/approval-intents/consume", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe.sequential("Agent one-time human approval proof", () => {
  beforeEach(() => {
    process.env.AGENT_API_SECRET = "agent-service-secret";
    delete process.env.PROFIXIQ_AGENT_API_SECRET;
    delete process.env.INTERNAL_AGENT_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    rpc.mockReset();
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("authenticates the Agent service with timing-safe canonical and rollout aliases", () => {
    const canonical = new Request("https://profixiq.test", {
      headers: { "x-agent-api-secret": "canonical" },
    });
    expect(isAgentApiRequestAuthorized(canonical, {
      AGENT_API_SECRET: "canonical",
      PROFIXIQ_AGENT_API_SECRET: "rollout-alias",
    })).toBe(true);

    const alias = new Request("https://profixiq.test", {
      headers: { authorization: "Bearer rollout-alias" },
    });
    expect(isAgentApiRequestAuthorized(alias, {
      AGENT_API_SECRET: "canonical",
      PROFIXIQ_AGENT_API_SECRET: "rollout-alias",
    })).toBe(true);

    const attacker = new Request("https://profixiq.test", {
      headers: { "x-agent-api-secret": "canonical-but-wrong" },
    });
    expect(isAgentApiRequestAuthorized(attacker, {
      AGENT_API_SECRET: "canonical",
    })).toBe(false);
  });

  it("rejects unauthenticated callers before parsing or invoking service-role access", async () => {
    const response = await POST(request({
      approvalProof,
      approvalKind: "mission",
      approvedBy: approverUserId,
      engineeringCaseId,
      missionId,
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ valid: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds authenticated consumption to proof, actor, case, kind, and mission", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });

    const response = await POST(request({
      approvalProof,
      approvalKind: "mission",
      approvedBy: approverUserId,
      engineeringCaseId,
      missionId,
    }, "agent-service-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ valid: true });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("consume_agent_human_approval_intent", {
      p_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_approval_kind: "mission",
      p_approver_user_id: approverUserId,
      p_engineering_case_id: engineeringCaseId,
      p_mission_id: missionId,
    });
  });

  it("returns false when the database rejects a replayed or mismatched proof", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });

    const response = await POST(request({
      approvalProof,
      approvalKind: "release",
      approvedBy: approverUserId,
      engineeringCaseId,
    }, "agent-service-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ valid: false });
  });

  it("fails closed when proof verification is unavailable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });

    const response = await POST(request({
      approvalProof,
      approvalKind: "mission",
      approvedBy: approverUserId,
      engineeringCaseId,
      missionId,
    }, "agent-service-secret"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      valid: false,
      error: "approval intent verification unavailable",
    });
  });
});
