import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAgentApiSecrets } from "@/features/shared/lib/server/agent-api-secrets";

const teamClientSource = readFileSync(
  join(process.cwd(), "features/agent/server/teamClient.ts"),
  "utf8",
);
const requestRouteSource = readFileSync(
  join(process.cwd(), "app/api/agent/requests/route.ts"),
  "utf8",
);
const controlRouteSource = readFileSync(
  join(process.cwd(), "app/api/agent/requests/[id]/route.ts"),
  "utf8",
);
const replyRouteSource = readFileSync(
  join(process.cwd(), "app/api/agent/requests/[id]/reply/route.ts"),
  "utf8",
);
const discordRouteSource = readFileSync(
  join(process.cwd(), "app/api/agent/requests/[id]/notify-discord/route.ts"),
  "utf8",
);
const bridgeCreateMigrationSource = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260805202500_agent_team_bridge_credentials.sql",
  ),
  "utf8",
);
const bridgeMoveMigrationSource = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260805202600_move_agent_bridge_to_integrations.sql",
  ),
  "utf8",
);

describe("ProFixIQ-Agent team authentication contract", () => {
  it("prefers the canonical environment secret over legacy aliases", () => {
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

  it("retains environment aliases as migration fallbacks", () => {
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

  it("keeps the durable bridge in the existing service-only integration registry", () => {
    expect(teamClientSource).toContain('.from("integrations")');
    expect(teamClientSource).toContain('BRIDGE_INTEGRATION_KIND = "profixiq_agent_bridge"');
    expect(teamClientSource).toContain('.is("shop_id", null)');
    expect(teamClientSource).toContain('headers.set("x-profixiq-bridge-secret", bridgeSecret)');
    expect(teamClientSource).toContain("SUPABASE_SERVICE_ROLE_KEY");

    expect(bridgeCreateMigrationSource).toContain(
      "revoke all on table public.agent_bridge_credentials from public, anon, authenticated",
    );
    expect(bridgeMoveMigrationSource).toContain("insert into public.integrations");
    expect(bridgeMoveMigrationSource).toContain("'kind', 'profixiq_agent_bridge'");
    expect(bridgeMoveMigrationSource).toContain("shop_id = null");
    expect(bridgeMoveMigrationSource).toContain(
      "drop table if exists public.agent_bridge_credentials",
    );
  });

  it("keeps environment credentials available during bridge rollout", () => {
    expect(teamClientSource).toContain('headers.set(\n      "x-agent-api-secret"');
    expect(teamClientSource).toContain('headers.set(\n      "x-agent-secret"');
    expect(teamClientSource).toContain('headers.set(\n      "authorization"');
    expect(teamClientSource).toContain(
      '"No active database bridge credential or Agent API secret is available."',
    );
  });

  it("routes the complete UI control plane through the canonical Agent service", () => {
    expect(requestRouteSource).toContain("agentTeamRequest<AgentServiceResponse>");
    expect(requestRouteSource).toContain("readAgentTeamCase");
    expect(controlRouteSource).toContain("approveAgentTeamMission");
    expect(controlRouteSource).toContain("approveAgentTeamRelease");
    expect(controlRouteSource).toContain("rejectAgentTeamCase");
    expect(replyRouteSource).toContain("resumeAgentTeamCase");
    expect(replyRouteSource).toContain("readAgentTeamCase");
    expect(discordRouteSource).toContain('"/notify-discord"');
    expect(discordRouteSource).toContain("agentTeamRequest");
    expect(controlRouteSource).not.toContain("agent_approve_action");
    expect(controlRouteSource).not.toContain("feature-requests/merge");
    expect(controlRouteSource).not.toContain('.from("agent_jobs")');
    expect(discordRouteSource).not.toContain('.from("agent_jobs")');
  });
});
