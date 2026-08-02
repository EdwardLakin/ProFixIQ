import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  join(process.cwd(), "app/api/agent/requests/route.ts"),
  "utf8",
);

describe("ProFixIQ-Agent request authentication contract", () => {
  it("prefers the canonical shared secret over legacy aliases", () => {
    const canonicalIndex = routeSource.indexOf("process.env.AGENT_API_SECRET");
    const profixiqAliasIndex = routeSource.indexOf(
      "process.env.PROFIXIQ_AGENT_API_SECRET",
    );
    const internalAliasIndex = routeSource.indexOf(
      "process.env.INTERNAL_AGENT_SECRET",
    );

    expect(canonicalIndex).toBeGreaterThan(-1);
    expect(profixiqAliasIndex).toBeGreaterThan(canonicalIndex);
    expect(internalAliasIndex).toBeGreaterThan(profixiqAliasIndex);
    expect(routeSource).toContain(
      "primary: canonical || profixiqAlias || internalAlias",
    );
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
