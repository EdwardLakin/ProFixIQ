import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getActorCapabilities } from "@/features/shared/lib/rbac";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Work Order Add Job authorization", () => {
  it("hides workspace controls for Parts using the established capability", () => {
    expect(getActorCapabilities({ role: "parts" }).canManageWorkOrders).toBe(
      false,
    );

    const workspace = read("app/work-orders/[id]/Client.tsx");
    expect(workspace).toContain(
      "currentActor.canManageWorkOrders || currentActor.canPerformAssignedWork",
    );
    expect(workspace).toContain("{canAddJobs ? (");
    expect(workspace).toContain("{canAddJobs && addJobOpen && wo?.id ? (");
    expect(workspace).toContain("canAddJob={canAddJobs}");
    expect(workspace).toContain("resolveCanonicalStaffProfile(");

    const quoteReview = read(
      "features/work-orders/quote-review/QuoteReviewView.tsx",
    );
    expect(quoteReview).toContain(
      "const canAddJob = currentActor.canManageWorkOrders",
    );
    expect(quoteReview).toContain("{canAddJob ? (");
    expect(quoteReview).toContain("resolveCanonicalStaffProfile(");
  });

  it("keeps focused desktop and mobile entry points fail closed", () => {
    const focused = read(
      "features/work-orders/components/workorders/FocusedJobModal.tsx",
    );
    const mobile = read("features/work-orders/mobile/MobileFocusedJob.tsx");
    const standaloneDesktop = read(
      "app/work-orders/[id]/focused-job/[lineId]/page.tsx",
    );
    const standaloneMobile = read("app/mobile/jobs/[lineId]/page.tsx");

    expect(focused).toContain("canAddJob = false");
    expect(focused).toContain("{canAddJob && workOrder?.id ? (");
    expect(focused).toContain("{canAddJob && openAddJob && workOrder?.id ? (");
    expect(mobile).toContain("canAddJob = false");
    expect(mobile).toContain("{canAddJob && workOrder?.id ? (");
    expect(mobile).toContain("{canAddJob && openAddJob && workOrder?.id && (");
    expect(standaloneDesktop).toContain("currentActor.canPerformAssignedWork");
    expect(standaloneMobile).toContain(
      "resolveCanonicalStaffProfile(supabase, user.id",
    );
    expect(standaloneMobile).toContain(
      "actor.canManageWorkOrders || actor.canPerformAssignedWork",
    );
    expect(standaloneMobile).toContain("canAddJob={canAddJob}");
  });

  it("routes line creation through the protected endpoint without a browser insert", () => {
    const modal = read(
      "features/work-orders/components/workorders/AddJobModal.tsx",
    );

    expect(modal).toContain(
      "`/api/work-orders/${encodeURIComponent(workOrderId)}/lines`",
    );
    expect(modal).toContain('"Idempotency-Key": body.lineId');
    expect(modal).toContain("busy={submitting}");
    expect(modal).toContain('"Unable to add the work-order line."');
    expect(modal).not.toContain("result?.error || raw");
    expect(modal).not.toContain('from("work_order_lines")');
    expect(modal).not.toContain("createBrowserSupabase");
  });
});
