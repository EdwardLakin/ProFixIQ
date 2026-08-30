import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const signInRoute = read("app/api/auth/sign-in/route.ts");
const approvalRoute = read(
  "app/api/work-orders/lines/[id]/approval-decision/route.ts",
);
const punchTransition = read(
  "features/work-orders/server/applyJobPunchTransition.ts",
);
const technicianLabor = read(
  "features/work-orders/server/technicianJobLabor.ts",
);
const staffDecisionMigration = read(
  "supabase/migrations/20260830044000_add_staff_line_decision_boundary.sql",
);

describe("customer portal sign-in bootstrap", () => {
  it("resolves the customer and invite with the server-side client", () => {
    const customerBlock = signInRoute.slice(
      signInRoute.indexOf('if (surface === "customer")'),
      signInRoute.indexOf('if (surface === "fleet")'),
    );
    expect(customerBlock).toContain("const admin = createAdminSupabase()");
    expect(customerBlock).toContain('await admin\n      .from("customers")');
    expect(customerBlock).toContain('await admin\n      .from("customer_portal_invites")');
    expect(customerBlock).not.toContain('await supabase\n      .from("customers")');
    expect(customerBlock).toContain('.eq("user_id", signedInUser.id)');
    expect(customerBlock).toContain('.eq("accepted_by_user_id", signedInUser.id)');
    expect(customerBlock).toContain('.is("revoked_at", null)');
  });
});

describe("staff approval decision routing", () => {
  it("resolves a canonical staff profile before falling back to portal authorization", () => {
    expect(approvalRoute).toContain("resolveAuthenticatedStaffProfile");
    expect(approvalRoute).toContain("if (profile?.shop_id)");
    expect(approvalRoute).toContain("requirePortalCustomerActor(supabase)");
  });

  it("uses the guarded staff-specific atomic adapter for staff decisions", () => {
    expect(approvalRoute).toContain(
      'rpc.rpc("apply_staff_line_decision_atomic"',
    );
    expect(approvalRoute).toContain("p_line_id: lineId");
    expect(approvalRoute).toContain("p_actor_user_id: actor.profileId");
    expect(approvalRoute).toContain(
      'p_operation_key: `${actor.shopId}:staff-line-decision:${key}`',
    );
    expect(staffDecisionMigration).toContain(
      "create or replace function public.apply_staff_line_decision_atomic",
    );
    expect(staffDecisionMigration).toContain("'in_progress'");
    expect(staffDecisionMigration).toContain(
      "from public.work_order_line_labor_segments seg",
    );
    expect(staffDecisionMigration).toContain(
      "STAFF_LINE_DECISION_ACTIVE_LABOR",
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
  it("resolves shop and assignment server-side instead of through financial RLS", () => {
    expect(punchTransition).toContain("resolveAuthenticatedStaffProfile");
    expect(punchTransition).toContain("createAdminSupabase");
    expect(punchTransition).toContain('admin\n    .from("work_order_lines")');
    expect(punchTransition).toContain("capabilities.canPerformAssignedWork");
    expect(punchTransition).toContain("isAssigned");
    expect(punchTransition).toContain(
      "Technician is not assigned to this work-order line.",
    );
  });

  it("binds ordinary punch requests to the authenticated technician", () => {
    expect(punchTransition).toContain("await supabase.auth.getUser()");
    expect(punchTransition).toContain("technicianId !== actorUserId");
    expect(punchTransition).toContain("technicianId !== actorProfileId");
    expect(punchTransition).toContain("p_actor_user_id: actorUserId");
  });

  it("preserves the trusted break and lunch auto-resume path", () => {
    expect(technicianLabor).toContain('params.source !== "break_resume"');
    expect(technicianLabor).toContain('params.source !== "lunch_resume"');
    expect(technicianLabor).toContain("resolveInternalResumeActor");
    expect(technicianLabor).toContain("trustedActor");
  });
});
