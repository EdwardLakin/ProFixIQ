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
const generatedTypes = read("features/shared/types/types/supabase.ts");
const portalApprovalActions = read(
  "features/portal/components/QuoteApprovalActions.tsx",
);
const portalApprovalsPage = read("app/portal/approvals/page.tsx");
const desktopWorkOrder = read("app/work-orders/[id]/Client.tsx");
const mobileWorkOrder = read(
  "features/work-orders/mobile/MobileWorkOrderClient.tsx",
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
  it("binds explicit portal intent before considering a shop-linked profile", () => {
    expect(approvalRoute).toContain("resolveAuthenticatedStaffProfile");
    expect(approvalRoute).toContain('actorSurface === "portal"');
    expect(approvalRoute).toContain('actorSurface !== "portal" && profile?.shop_id');
    expect(approvalRoute).toContain("requirePortalCustomerActor(supabase)");
    expect(portalApprovalActions).toContain('actorSurface: "portal"');
    expect(portalApprovalsPage).toContain('actorSurface: "portal"');
    expect(desktopWorkOrder).toContain('actorSurface: "staff"');
    expect(mobileWorkOrder).toContain('actorSurface: "staff"');
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
      "technician labor has already been recorded for this line",
    );
    expect(staffDecisionMigration).not.toContain("and seg.ended_at is null");
    expect(generatedTypes).toContain("apply_staff_line_decision_atomic: {");
    expect(approvalRoute).not.toContain("supabase as unknown as RpcClient");
  });

  it("returns exact receipts before state checks and uses canonical lock ordering", () => {
    const receiptLookup = staffDecisionMigration.indexOf(
      "from public.quote_lifecycle_operation_keys operation",
    );
    const workOrderLock = staffDecisionMigration.indexOf(
      "from public.work_orders wo",
    );
    const siblingLocks = staffDecisionMigration.indexOf(
      "from public.work_order_lines sibling",
    );
    const serializedReceiptLookup = staffDecisionMigration.indexOf(
      "select operation.result, operation.actor_user_id, operation.work_order_id",
      siblingLocks,
    );
    const laborCheck = staffDecisionMigration.indexOf(
      "from public.work_order_line_labor_segments seg",
    );

    expect(receiptLookup).toBeGreaterThan(-1);
    expect(workOrderLock).toBeGreaterThan(receiptLookup);
    expect(siblingLocks).toBeGreaterThan(workOrderLock);
    expect(serializedReceiptLookup).toBeGreaterThan(siblingLocks);
    expect(laborCheck).toBeGreaterThan(serializedReceiptLookup);
    expect(staffDecisionMigration).toContain("for update nowait");
    expect(staffDecisionMigration).toContain("when lock_not_available then");
    expect(staffDecisionMigration).toContain("perform pg_sleep(0.02)");
    expect(staffDecisionMigration).toContain(
      "return v_existing_result || jsonb_build_object('idempotent', true)",
    );
    expect(staffDecisionMigration).toContain(
      "STAFF_LINE_DECISION_OPERATION_CONFLICT",
    );

    const delegatedCall = staffDecisionMigration.indexOf(
      "v_result := public.apply_approval_compatibility_bundle_atomic(",
    );
    const delegatedReceiptValidation = staffDecisionMigration.indexOf(
      "select operation.result, operation.actor_user_id, operation.work_order_id",
      delegatedCall,
    );
    expect(delegatedCall).toBeGreaterThan(laborCheck);
    expect(delegatedReceiptValidation).toBeGreaterThan(delegatedCall);
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
    expect(punchTransition).toContain('.from("workforce_operation_keys")');
    expect(punchTransition.indexOf('.from("workforce_operation_keys")')).toBeLessThan(
      punchTransition.indexOf('.from("work_order_line_labor_segments")'),
    );
  });

  it("preserves the trusted break and lunch auto-resume path", () => {
    expect(technicianLabor).toContain('params.source !== "break_resume"');
    expect(technicianLabor).toContain('params.source !== "lunch_resume"');
    expect(technicianLabor).toContain("resolveInternalResumeActor");
    expect(technicianLabor).toContain("trustedActor");
    expect(technicianLabor).toContain('select("id,user_id,shop_id,role")');
    expect(technicianLabor).toContain("capabilities.canPerformAssignedWork");
  });
});
