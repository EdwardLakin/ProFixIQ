import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("production agent request handoff", () => {
  const route = read("app/api/agent/requests/route.ts");
  const secrets = read("features/shared/lib/server/agent-api-secrets.ts");

  it("uses explicit production configuration and authenticated service calls", () => {
    expect(route).toContain("PROFIXIQ_AGENT_URL");
    expect(route).toContain("resolveAgentApiSecrets()");
    expect(secrets).toContain("PROFIXIQ_AGENT_API_SECRET");
    expect(route).toContain('"x-agent-api-secret": agentSecrets.canonical');
    expect(route).not.toContain("app.github.dev");
  });

  it("sends canonical engineering context to the production workforce", () => {
    expect(route).toContain("const expectedBehavior = asNullableString(body.expected)");
    expect(route).toContain("const actualBehavior = asNullableString(body.actual)");
    expect(route).toContain("expectedBehavior,");
    expect(route).toContain("actualBehavior,");
    expect(route).toContain("const signedScreenshotUrls = signedAttachments.map");
    expect(route).toContain("screenshots: signedScreenshotUrls");
    expect(route).toContain("const route = asNullableString(body.location)");
    expect(route).toContain("const browser = asNullableString(body.device)");
  });

  it("fails visibly instead of leaving a broken request submitted", () => {
    expect(route).toContain('status: "failed" as AgentRequestStatus');
    expect(route).toContain('error: "ProFixIQ-Agent request failed"');
    expect(route).toContain("{ status: 502 }");
  });

  it("marks persisted engineering cases in progress", () => {
    expect(route).toContain("agentResponse?.engineeringCaseId");
    expect(route).toContain("agentResponse?.intakeJobId");
    expect(route).toContain('? "in_progress"');
  });
});
