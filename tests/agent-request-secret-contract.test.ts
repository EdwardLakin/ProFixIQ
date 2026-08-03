import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAgentApiSecrets } from "@/features/shared/lib/server/agent-api-secrets";

const routeSource = readFileSync(
  join(process.cwd(), "app/api/agent/requests/route.ts"),
  "utf8",
);

describe("ProFixIQ-Agent request authentication contract", () => {
  it("prefers the canonical shared secret over legacy aliases", () => {
    expect(resolveAgentApiSecrets({
      AGENT_API_SECRET: " canonical-secret ",
      PROFIXIQ_AGENT_API_SECRET: "profixiq-alias",
      INTERNAL_AGENT_SECRET: "internal-alias",
    })).toEqual({
      canonical: "canonical-secret",
      profixiqAlias: "profixiq-alias",
      internalAlias: "internal-alias",
      primary: "canonical-secret",
    });
  });

  it("skips blank canonical values and falls back to the first nonblank alias", () => {
    expect(resolveAgentApiSecrets({
      AGENT_API_SECRET: "   ",
      PROFIXIQ_AGENT_API_SECRET: " profixiq-alias ",
      INTERNAL_AGENT_SECRET: "internal-alias",
    }).primary).toBe("profixiq-alias");

    expect(resolveAgentApiSecrets({
      AGENT_API_SECRET: "",
      PROFIXIQ_AGENT_API_SECRET: "\t",
      INTERNAL_AGENT_SECRET: " internal-alias ",
    }).primary).toBe("internal-alias");
  });

  it("presents each configured credential through a supported auth channel", () => {
    expect(routeSource).toContain(
      '"x-agent-api-secret": agentSecrets.canonical || agentSecrets.primary',
    );
    expect(routeSource).toContain(
      '"x-agent-secret": agentSecrets.profixiqAlias || agentSecrets.primary',
    );
    expect(routeSource).toContain(
      "Authorization: `Bearer ${agentSecrets.internalAlias || agentSecrets.primary}`",
    );
  });

  it("fails before dispatch when no shared secret is configured", () => {
    expect(routeSource).toContain(
      'throw new Error("AGENT_API_SECRET is not configured")',
    );
  });
});
