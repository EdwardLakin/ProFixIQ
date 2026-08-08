import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decideAgentRequestRetry,
  isAgentRequestRetryVisible,
} from "@/features/agent/lib/requestRetry";

const retryRoute = readFileSync(
  "app/api/agent/requests/[id]/retry/route.ts",
  "utf8",
);
const consolePage = readFileSync(
  "features/agent/agent-console/app/agent/page.tsx",
  "utf8",
);
const evidenceMigration = readFileSync(
  "supabase/migrations/20260808172810_provision_agent_uploads.sql",
  "utf8",
);

describe("agent request retry policy", () => {
  it("resubmits a failed transport with no engineering case", () => {
    expect(decideAgentRequestRetry({ requestStatus: "failed" })).toMatchObject({
      allowed: true,
      action: "resubmit",
    });
  });

  it("resumes blocked cases and failed current stages", () => {
    expect(decideAgentRequestRetry({
      requestStatus: "in_progress",
      caseStatus: "blocked",
      stepStatus: "blocked",
    }).action).toBe("resume");
    expect(decideAgentRequestRetry({
      requestStatus: "failed",
      caseStatus: "active",
      stepStatus: "failed",
    }).action).toBe("resume");
  });

  it("only synchronizes a stale local failure when Agent work is active", () => {
    expect(decideAgentRequestRetry({
      requestStatus: "failed",
      caseStatus: "active",
      stepStatus: "running",
    })).toMatchObject({ allowed: true, action: "synchronize" });
  });

  it("does not retry ordinary active or terminal cases", () => {
    expect(decideAgentRequestRetry({
      requestStatus: "in_progress",
      caseStatus: "active",
      stepStatus: "running",
    }).allowed).toBe(false);
    expect(decideAgentRequestRetry({
      requestStatus: "merged",
      caseStatus: "complete",
      stepStatus: "passed",
    }).allowed).toBe(false);
  });

  it("shows the control for failed requests and blocked cases", () => {
    expect(isAgentRequestRetryVisible({ requestStatus: "failed" })).toBe(true);
    expect(isAgentRequestRetryVisible({
      requestStatus: "in_progress",
      caseStatus: "blocked",
    })).toBe(true);
    expect(isAgentRequestRetryVisible({
      requestStatus: "in_progress",
      caseStatus: "active",
    })).toBe(false);
  });
});

describe("agent request retry integration contract", () => {
  it("keeps retry owner-only and delegates execution to the canonical Agent service", () => {
    expect(retryRoute).toContain("requireOpsOperatorApiAccess");
    expect(retryRoute).toContain("submitAgentTeamRequest");
    expect(retryRoute).toContain("resumeAgentTeamCase");
    expect(retryRoute).toContain("readAgentTeamCase");
    expect(retryRoute).not.toContain('.from("agent_jobs")');
  });

  it("reuses original evidence and records retry history", () => {
    expect(retryRoute).toContain('.from("agent_uploads")');
    expect(retryRoute).toContain("createSignedUrls");
    expect(retryRoute).toContain("requestId: id");
    expect(retryRoute).toContain("retryHistory:");
  });

  it("provisions private owner-scoped evidence storage from migrations", () => {
    expect(evidenceMigration).toContain("insert into storage.buckets");
    expect(evidenceMigration).toContain("'agent_uploads'");
    expect(evidenceMigration).toContain("false,\n  20971520");
    expect(evidenceMigration).toContain("agent_uploads_insert_own");
    expect(evidenceMigration).toContain("agent_uploads_select_own_or_operator");
    expect(evidenceMigration).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(evidenceMigration).toContain("edwardlakin35@gmail.com");
    expect(evidenceMigration).not.toContain("for all");
  });

  it("offers separate retry and restart labels in Agent Control", () => {
    expect(consolePage).toContain("/retry");
    expect(consolePage).toContain('"Retry Request"');
    expect(consolePage).toContain('"Restart Investigation"');
  });
});
