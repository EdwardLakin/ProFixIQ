import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ops AI usage observability", () => {
  it("adds an owner-only Ops AI Usage route and navigation entry", () => {
    const shell = read("features/ops/components/OpsShell.tsx");
    const page = read("app/ops/ai-usage/page.tsx");
    expect(shell).toContain('href: "/ops/ai-usage"');
    expect(shell).toContain('label: "AI Usage"');
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getOpsAIUsage");
  });

  it("reads the private ledger only through a service-role RPC after Ops authorization", () => {
    const server = read("features/ops/server/get-ai-usage.ts");
    expect(server).toContain("requireOpsOperatorPageAccess");
    expect(server).toContain("createAdminSupabase");
    expect(server).toContain('admin.rpc("get_ops_ai_usage_snapshot"');
  });

  it("shows the requested spend, token, breakdown, failure and warning surfaces", () => {
    const component = read("features/ops/components/OpsAIUsage.tsx");
    [
      "Spend today",
      "Last 7 days",
      "Month to date",
      "Input tokens",
      "Cached input",
      "Output tokens",
      "By product",
      "By model",
      "By feature / endpoint",
      "By shop",
      "By user / actor",
      "Highest-cost requests / runs",
      "429 / quota",
      "Token and cost trend",
      "Cost / usage warnings",
    ].forEach((label) => expect(component).toContain(label));
  });

  it("extends the canonical ledger for product and Agent run attribution without exposing private schema reads", () => {
    const migration = read("supabase/migrations/20260920210000_ops_ai_usage_observability.sql");
    expect(migration).toContain("source_product");
    expect(migration).toContain("agent_run_id");
    expect(migration).toContain("external_request_id");
    expect(migration).toContain("get_ops_ai_usage_snapshot");
    expect(migration).toContain("abnormal_prompt");
    expect(migration).toContain("runaway_agent_run");
    expect(migration).toContain("high_request_frequency");
    expect(migration).toContain("revoke all on function rls_helpers.get_ops_ai_usage_snapshot");
    expect(migration).toContain("to service_role");
  });

  it("accepts authenticated Engineering Agent usage into the same canonical ledger", () => {
    const route = read("app/api/internal/agent/ai-usage/route.ts");
    expect(route).toContain("isAgentApiRequestAuthorized");
    expect(route).toContain('"record_ai_usage_ledger"');
    expect(route).toContain('source_product: "engineering_agent"');
    expect(route).toContain("agent_run_id");
    expect(route).toContain("external_request_id");
  });
});
