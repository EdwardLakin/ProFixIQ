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
  });

  it("sends the canonical and legacy-compatible authentication headers", () => {
    expect(routeSource).toContain('"x-agent-api-secret": agentSecret');
    expect(routeSource).toContain('"x-agent-secret": agentSecret');
    expect(routeSource).toContain("Authorization: `Bearer ${agentSecret}`");
  });

  it("fails before dispatch when no shared secret is configured", () => {
    expect(routeSource).toContain(
      'throw new Error("AGENT_API_SECRET is not configured")',
    );
  });
});
