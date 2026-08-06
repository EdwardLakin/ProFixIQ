import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type AgentHumanApprovalKind = "mission" | "release";

const APPROVAL_INTENT_TTL_MS = 3 * 60 * 1000;
const APPROVAL_PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function requiredEnvironment(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function adminClient() {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requiredUuid(value: string, name: string): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`${name} must be a UUID`);
  }
  return normalized;
}

export async function mintAgentHumanApprovalIntent(params: {
  requestId: string;
  engineeringCaseId: string;
  missionId?: string | null;
  approvalKind: AgentHumanApprovalKind;
  approverUserId: string;
}): Promise<string> {
  const requestId = requiredUuid(params.requestId, "requestId");
  const engineeringCaseId = requiredUuid(params.engineeringCaseId, "engineeringCaseId");
  const approverUserId = requiredUuid(params.approverUserId, "approverUserId");
  const missionId = params.approvalKind === "mission"
    ? requiredUuid(String(params.missionId ?? ""), "missionId")
    : null;
  const proof = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + APPROVAL_INTENT_TTL_MS).toISOString();

  const { error } = await adminClient()
    .from("agent_human_approval_intents")
    .insert({
      request_id: requestId,
      engineering_case_id: engineeringCaseId,
      mission_id: missionId,
      approval_kind: params.approvalKind,
      approver_user_id: approverUserId,
      token_sha256: sha256(proof),
      expires_at: expiresAt,
      metadata: { source: "profixiq-agent-console" },
    });

  if (error) {
    throw new Error(`Unable to mint Agent human approval intent: ${error.message}`);
  }

  return proof;
}

export async function consumeAgentHumanApprovalIntent(params: {
  proof: string;
  approvalKind: AgentHumanApprovalKind;
  approverUserId: string;
  engineeringCaseId: string;
  missionId?: string | null;
}): Promise<boolean> {
  const proof = String(params.proof ?? "").trim();
  if (!APPROVAL_PROOF_PATTERN.test(proof)) return false;

  const engineeringCaseId = requiredUuid(params.engineeringCaseId, "engineeringCaseId");
  const approverUserId = requiredUuid(params.approverUserId, "approverUserId");
  const missionId = params.approvalKind === "mission"
    ? requiredUuid(String(params.missionId ?? ""), "missionId")
    : null;

  const { data, error } = await adminClient().rpc("consume_agent_human_approval_intent", {
    p_token_sha256: sha256(proof),
    p_approval_kind: params.approvalKind,
    p_approver_user_id: approverUserId,
    p_engineering_case_id: engineeringCaseId,
    p_mission_id: missionId,
  });

  if (error) {
    throw new Error(`Unable to consume Agent human approval intent: ${error.message}`);
  }
  return data === true;
}
