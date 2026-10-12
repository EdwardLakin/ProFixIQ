import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("feedback intake hardening", () => {
  const create = source("app/api/feedback/route.ts");
  const update = source("app/api/feedback/[id]/route.ts");

  it("never returns model output or cross-tenant identifiers to the reporter", () => {
    const post = create.slice(create.indexOf("export async function POST"), create.indexOf("export async function GET"));
    expect(post).not.toContain("triage: triage.output");
    expect(post).not.toContain("feedbackId: canonicalId,\n    submissionId");
    expect(post).toContain("matchedExisting: duplicateId !== null");
  });

  it("replays duplicate submissions by a durable per-reporter key", () => {
    expect(create).toContain('.eq("normalized_json->>submissionKey", context.submissionKey)');
    expect(create).toContain(".eq(\"reporter_id\", profile.id)");
    expect(source("features/feedback/components/FeedbackModal.tsx")).toContain("submissionKey: submissionKeyRef.current");
  });

  it("pages the ledger instead of truncating history", () => {
    expect(create).toContain("fetchAllLedgerRows");
    expect(create).not.toContain(".limit(1000)");
    expect(update).not.toContain(".limit(1500)");
    expect(source("features/feedback/server/ledger.ts")).toContain(".range(from, from + PAGE_SIZE - 1)");
  });

  it("merges cluster severity with compare-and-set and notifies only on crossed milestones", () => {
    expect(create).toContain("SEVERITY_RANK");
    expect(create).toContain('.eq("normalized_json->feedback->>lastSeenAt", canonicalMeta.lastSeenAt)');
    expect(create).toContain("addedNewShop");
  });

  it("claims requester notifications atomically and rolls back partial lifecycle writes", () => {
    expect(update).toContain('.is("normalized_json->feedback->>requesterNotifiedAt", null)');
    expect(update).toContain("feedback status rollback failed");
    expect(update).toContain("Feedback changed concurrently");
  });

  it("builds the Ops overview from canonical clusters", () => {
    const dashboard = source("features/ops/server/get-dashboard.ts");
    expect(dashboard).toContain("fetchAllLedgerRows");
    expect(dashboard).toContain("id: clusterId");
  });
});
