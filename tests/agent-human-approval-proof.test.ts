import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Agent one-time human approval proof", () => {
  const migration = read("supabase/migrations/20260806231000_agent_human_approval_intents.sql");
  const proofService = read("features/agent/server/humanApprovalIntent.ts");
  const approvalClient = read("features/agent/server/humanApprovalClient.ts");
  const consumeRoute = read("app/api/internal/agent/approval-intents/consume/route.ts");
  const requestRoute = read("app/api/agent/requests/[id]/route.ts");

  it("stores only a short-lived proof digest behind service-role-only RLS", () => {
    expect(migration).toContain("create table if not exists public.agent_human_approval_intents");
    expect(migration).toContain("token_sha256 text not null unique");
    expect(migration).toContain("alter table public.agent_human_approval_intents enable row level security");
    expect(migration).toContain("revoke all on table public.agent_human_approval_intents from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.agent_human_approval_intents to service_role");
    expect(migration).not.toMatch(/approval_proof\s+text/i);
    expect(proofService).toContain("randomBytes(32).toString(\"base64url\")");
    expect(proofService).toContain("APPROVAL_INTENT_TTL_MS = 3 * 60 * 1000");
    expect(proofService).toContain("token_sha256: sha256(proof)");
    expect(proofService).not.toContain("approvalProof:");
  });

  it("atomically consumes the proof exactly once and rejects expired intents", () => {
    expect(migration).toContain("create or replace function public.consume_agent_human_approval_intent");
    expect(migration).toContain("and consumed_at is null");
    expect(migration).toContain("and expires_at > now()");
    expect(migration).toContain("set consumed_at = now()");
    expect(migration).toContain("grant execute on function public.consume_agent_human_approval_intent");
    expect(proofService).toContain('.rpc("consume_agent_human_approval_intent"');
    expect(consumeRoute).toContain("consumeAgentHumanApprovalIntent");
    expect(consumeRoute).toContain("return NextResponse.json({ valid })");
  });

  it("mints proof only inside an authenticated approve action and binds it to the real case", () => {
    expect(requestRoute).toContain("const access = await requireDeveloperProfile()");
    expect(requestRoute).toContain("if (body.action === \"approve\")");
    expect(requestRoute).toContain("mintAgentHumanApprovalIntent({");
    expect(requestRoute).toContain('approvalKind: "mission"');
    expect(requestRoute).toContain('approvalKind: "release"');
    expect(requestRoute).toContain("approverUserId: user.id");
    expect(requestRoute).toContain("engineeringCaseId: currentProjection.engineeringCaseId");
    expect(requestRoute).toContain("missionId: currentProjection.mission.id");
  });

  it("forwards the raw proof only server-to-server for the single approval attempt", () => {
    expect(approvalClient).toContain('import "server-only"');
    expect(approvalClient).toContain("approvalProof: string");
    expect(approvalClient).toContain("approvalProof: params.approvalProof");
    expect(requestRoute).toContain("approvalProof,");
    expect(requestRoute).not.toContain("approvalProof: currentProjection");
  });
});
