import { describe, expectTypeOf, it } from "vitest";
import type { Database } from "@/features/shared/types/types/supabase";

type Tables = Database["public"]["Tables"];
type Functions = Database["public"]["Functions"];
type ApprovalIntentRow = Tables["agent_human_approval_intents"]["Row"];
type ConsumeApprovalArgs =
  Functions["consume_agent_human_approval_intent"]["Args"];

describe("generated Agent human-approval types", () => {
  it("tracks the durable approval-intent table", () => {
    expectTypeOf<ApprovalIntentRow>().toMatchTypeOf<{
      approval_kind: string;
      approver_user_id: string;
      consumed_at: string | null;
      engineering_case_id: string;
      expires_at: string;
      mission_id: string | null;
      request_id: string;
      token_sha256: string;
    }>();
  });

  it("tracks the proof-consumption RPC contract", () => {
    expectTypeOf<ConsumeApprovalArgs>().toEqualTypeOf<{
      p_approval_kind: string;
      p_approver_user_id: string;
      p_engineering_case_id: string;
      p_mission_id?: string;
      p_token_sha256: string;
    }>();
  });
});
