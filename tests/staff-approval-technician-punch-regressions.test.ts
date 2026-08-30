import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const approvalRoute = read(
  "app/api/work-orders/lines/[id]/approval-decision/route.ts",
);
const punchTransition = read(
  "features/work-orders/server/applyJobPunchTransition.ts",
);

describe("staff approval decision routing", () => {
  it("resolves a canonical staff profile before falling back to portal authorization", () => {
    expect(approvalRoute).toContain("resolveAuthenticatedStaffProfile");
    expect(approvalRoute).toContain("if (profile?.shop_id)");
    expect(approvalRoute).toContain("requirePortalCustomerActor(supabase)");
  });

  it("uses the established staff-compatible atomic approval bundle for staff decisions", () => {
    expect(approvalRoute).toContain(
      'rpc.rpc("apply_approval_compatibility_bundle_atomic"',
    );
    expect(approvalRoute).toContain("p_customer_id: null");
    expect(approvalRoute).toContain("p_actor_user_id: actor.profileId");
    expect(approvalRoute).toContain(
      'p_operation_key: `${actor.shopId}:staff-line-decision:${key}`',
    );
  });

  it("keeps pure portal customers on the portal decision contract", () => {
    expect(approvalRoute).toContain(
      'rpc.rpc("apply_portal_line_decision_atomic"',
    );
    expect(approvalRoute).toContain("p_customer_id: actor.customerId");
    expect(approvalRoute).toContain("p_actor_user_id: actor.userId");
  });
});

describe("assigned technician punch shop resolution", () => {
  it("does not pre-read work_order_lines through financial RLS", () => {
    expect(punchTransition).not.toContain('.from("work_order_lines")');
    expect(punchTransition).toContain("resolveAuthenticatedStaffProfile");
    expect(punchTransition).toContain("p_shop_id: profile.shop_id");
  });

  it("binds the punch actor to the authenticated session", () => {
    expect(punchTransition).toContain("await supabase.auth.getUser()");
    expect(punchTransition).toContain("technicianMatchesSession");
    expect(punchTransition).toContain("p_actor_user_id: user.id");
  });
});
