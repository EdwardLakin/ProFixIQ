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
const pauseRoute = read("app/api/work-orders/lines/[id]/pause/route.ts");
const resumeRoute = read("app/api/work-orders/lines/[id]/resume/route.ts");
const completeWorkOrderLine = read(
  "features/work-orders/server/completeWorkOrderLine.ts",
);
const punchClient = read(
  "features/work-orders/lib/jobPunchTransitionsClient.ts",
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
  it("requires explicit staff intent and defaults omitted surfaces to portal", () => {
    expect(approvalRoute).toContain("resolveAuthenticatedStaffProfile");
    expect(approvalRoute).toContain('actorSurface === "staff"');
    expect(approvalRoute).not.toContain(
      'actorSurface !== "portal" && profile?.shop_id',
    );
    expect(approvalRoute).toContain("requirePortalCustomerActor(supabase)");
    expect(portalApprovalActions).toContain('actorSurface: "portal"');
    expect(portalApprovalsPage).toContain('actorSurface: "portal"');
    expect(desktopWorkOrder).toContain('actorSurface: "staff"');
    expect(mobileWorkOrder).toContain('actorSurface: "staff"');
  });

  it("retains stable keys while allowing only the same decision to retry", () => {
    for (const [client, declineBoundary] of [
      [desktopWorkOrder, "const approveQuoteLine"],
      [mobileWorkOrder, "const sendToParts"],
    ] as const) {
      expect(client).toContain("lineDecisionOperationKeysRef");
      expect(client).toContain("lineDecisionPendingRef");
      expect(client).toContain("lineDecisionInFlightRef");
      expect(client).toContain(
        "pendingDecision !== undefined && pendingDecision !== decision",
      );
      expect(client).toContain(
        "lineDecisionOperationKeysRef.current.get(actionIdentity)",
      );
      expect(client).toContain(
        "lineDecisionOperationKeysRef.current.set(actionIdentity, operationKey)",
      );
      expect(client).toContain('"Idempotency-Key": operationKey');
      expect(client).toContain("idempotencyKey: operationKey");
      expect(client).toContain('pendingDecision !== "approve"');
      expect(client).toContain('pendingDecision !== "decline"');
      expect(client).toContain('"Retry approve"');
      expect(client).toContain('"Retry decline"');
      expect(client).toContain(
        "const refreshedPendingIds = new Set(approvalPending.map((line) => line.id))",
      );
      expect(client).toContain(
        "`${workOrderId}:${lineId}:approve`",
      );
      expect(client).toContain("`${workOrderId}:${lineId}:decline`");

      const approveBlock = client.slice(
        client.indexOf("const approveLine"),
        client.indexOf("const declineLine"),
      );
      const declineBlock = client.slice(
        client.indexOf("const declineLine"),
        client.indexOf(declineBoundary),
      );
      for (const decisionBlock of [approveBlock, declineBlock]) {
        expect(decisionBlock).toContain("responseBodyReadable");
        expect(decisionBlock).toContain("json?.ok !== true");
        expect(decisionBlock).toContain(
          "await fetchAll().catch(() => undefined)",
        );
        expect(decisionBlock).toContain("releaseLineDecisionInFlight(lineId)");
        expect(decisionBlock).not.toContain("res.json().catch(() => null)");

        const ambiguousResponse = decisionBlock.slice(
          decisionBlock.indexOf("if (!responseBodyReadable"),
          decisionBlock.indexOf("toast.success"),
        );
        expect(ambiguousResponse).not.toContain("clearLineDecision(");
        const serverErrorStart = decisionBlock.indexOf(
          "if (res.status >= 500)",
        );
        const definitiveRejection = decisionBlock.indexOf(
          "clearLineDecision(lineId, actionIdentity)",
        );
        expect(serverErrorStart).toBeGreaterThan(-1);
        expect(definitiveRejection).toBeGreaterThan(serverErrorStart);
        const ambiguousServerError = decisionBlock.slice(
          serverErrorStart,
          definitiveRejection,
        );
        expect(ambiguousServerError).toContain(
          "await fetchAll().catch(() => undefined)",
        );
        expect(ambiguousServerError).toContain("return;");
        expect(ambiguousServerError).not.toContain("clearLineDecision(");
        const finallyBoundary = decisionBlock.indexOf("} finally {");
        const interruptedRequest = decisionBlock.slice(
          decisionBlock.lastIndexOf("} catch {", finallyBoundary),
          finallyBoundary,
        );
        expect(interruptedRequest).not.toContain("clearLineDecision(");
      }
      expect(
        approveBlock.slice(approveBlock.indexOf('toast.success("Line approved")')),
      ).not.toContain("lineDecisionOperationKeysRef.current.delete(actionIdentity)");
      expect(
        declineBlock.slice(declineBlock.indexOf('toast.success("Line declined")')),
      ).not.toContain("lineDecisionOperationKeysRef.current.delete(actionIdentity)");
    }
  });

  it("maps durable decision-key conflicts to HTTP 409", () => {
    expect(approvalRoute).toContain('lower.includes("conflict")');
  });

  it("uses the guarded staff-specific atomic adapter for staff decisions", () => {
    expect(approvalRoute).toContain("getActorCapabilities");
    expect(approvalRoute).toContain("capabilities.canAuthorizeQuotes");
    expect(approvalRoute).not.toContain("STAFF_APPROVAL_ROLES");
    expect(mobileWorkOrder).toContain(
      "const canApprove = currentActor.canAuthorizeQuotes",
    );
    expect(approvalRoute).toContain(
      'rpc.rpc("apply_staff_line_decision_atomic"',
    );
    expect(approvalRoute).toContain("p_line_id: lineId");
    expect(approvalRoute).toContain("p_actor_user_id: actor.userId");
    expect(approvalRoute).toContain(
      'p_operation_key: `${actor.shopId}:staff-line-decision:${key}`',
    );
    expect(staffDecisionMigration).toContain(
      "create or replace function public.apply_staff_line_decision_atomic",
    );
    expect(staffDecisionMigration).toContain("'in_progress'");
    expect(staffDecisionMigration).toContain(
      "'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'",
    );
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

  it("checks the target and pricing quarantine through a scoped trusted projection", () => {
    const capabilityCheck = approvalRoute.indexOf(
      "capabilities.canAuthorizeQuotes",
    );
    const projection = approvalRoute.indexOf(
      'actor.kind === "staff" ? createAdminSupabase() : supabase',
    );
    const targetLookup = approvalRoute.indexOf(
      '.from("work_order_lines")',
      projection,
    );
    const quarantineCheck = approvalRoute.indexOf(
      "await checkQuotePricingQuarantine({",
      targetLookup,
    );
    const staffRpc = approvalRoute.indexOf(
      'rpc.rpc("apply_staff_line_decision_atomic"',
      quarantineCheck,
    );

    expect(capabilityCheck).toBeGreaterThan(-1);
    expect(projection).toBeGreaterThan(capabilityCheck);
    expect(targetLookup).toBeGreaterThan(projection);
    expect(quarantineCheck).toBeGreaterThan(targetLookup);
    expect(staffRpc).toBeGreaterThan(quarantineCheck);
    const scopedProjection = approvalRoute.slice(targetLookup, quarantineCheck);
    expect(scopedProjection).toContain('.eq("id", lineId)');
    expect(scopedProjection).toContain('.eq("work_order_id", workOrderId)');
    expect(scopedProjection).toContain('.eq("shop_id", actor.shopId)');
    expect(scopedProjection).toContain("if (!targetLine)");
    expect(approvalRoute).toContain("supabase: decisionReadClient");
    expect(approvalRoute).toContain("const rpc = supabase");
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
    const quoteLineLocks = staffDecisionMigration.indexOf(
      "from public.work_order_quote_lines quote_line",
      siblingLocks,
    );
    const segmentNowaitLocks = staffDecisionMigration.indexOf(
      "from public.work_order_line_labor_segments seg",
      quoteLineLocks,
    );
    const serializedReceiptLookup = staffDecisionMigration.indexOf(
      "select operation.result, operation.actor_user_id, operation.work_order_id",
      segmentNowaitLocks,
    );
    const laborCheck = staffDecisionMigration.indexOf(
      "from public.work_order_line_labor_segments seg",
      serializedReceiptLookup,
    );

    expect(receiptLookup).toBeGreaterThan(-1);
    expect(workOrderLock).toBeGreaterThan(receiptLookup);
    expect(siblingLocks).toBeGreaterThan(workOrderLock);
    expect(quoteLineLocks).toBeGreaterThan(siblingLocks);
    expect(segmentNowaitLocks).toBeGreaterThan(quoteLineLocks);
    expect(serializedReceiptLookup).toBeGreaterThan(segmentNowaitLocks);
    expect(laborCheck).toBeGreaterThan(serializedReceiptLookup);
    expect(
      staffDecisionMigration.slice(
        segmentNowaitLocks,
        staffDecisionMigration.indexOf("exit;", segmentNowaitLocks),
      ),
    ).toContain("for update nowait");
    expect(staffDecisionMigration).toContain("for update nowait");
    expect(staffDecisionMigration).toContain("when lock_not_available then");
    expect(staffDecisionMigration).toContain("perform pg_sleep(0.02)");
    expect(staffDecisionMigration).toContain(
      "return v_existing_result || jsonb_build_object('idempotent', true)",
    );
    expect(staffDecisionMigration).toContain(
      "STAFF_LINE_DECISION_OPERATION_CONFLICT",
    );

    const compatibilityMutation = staffDecisionMigration.indexOf(
      "v_rollup := public.reconcile_work_order_approval_state_atomic(",
    );
    const compatibilityReceipt = staffDecisionMigration.indexOf(
      "insert into public.quote_lifecycle_operation_keys(",
      compatibilityMutation,
    );
    const compatibilityAudit = staffDecisionMigration.indexOf(
      "insert into public.activity_logs",
      compatibilityReceipt,
    );
    const receiptValidation = staffDecisionMigration.indexOf(
      "select operation.result, operation.actor_user_id, operation.work_order_id",
      compatibilityAudit,
    );
    expect(compatibilityMutation).toBeGreaterThan(laborCheck);
    expect(compatibilityReceipt).toBeGreaterThan(compatibilityMutation);
    expect(compatibilityAudit).toBeGreaterThan(compatibilityReceipt);
    expect(receiptValidation).toBeGreaterThan(compatibilityAudit);
    expect(staffDecisionMigration).not.toContain(
      "public.apply_approval_compatibility_bundle_atomic(",
    );
    expect(staffDecisionMigration).toContain(
      "quote_line.metadata #> '{parts_quote,pricing_sanitization,customer_pricing_quarantined}'",
    );
    expect(staffDecisionMigration).toContain(
      "v_existing_actor_user_id is distinct from v_actor_auth_user_id",
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
      '.select("id,shop_id,assigned_tech_id,assigned_to,status,approval_state")',
    );
    expect(punchTransition).toContain("line.assigned_to === actorProfileId");
    expect(punchTransition).toContain("isLegacyOnlyAssignment");
    expect(punchTransition).toContain("anyCanonicalAssignment");
    expect(punchTransition).toContain(
      "Technician is not assigned to this work-order line.",
    );
  });

  it("keeps send-to-parts as a narrowly identified pre-labor transition", () => {
    expect(
      mobileWorkOrder.match(/transitionIntent: "parts_quote_hold"/g),
    ).toHaveLength(1);
    expect(punchClient).toContain('transitionIntent?: "parts_quote_hold"');
    expect(pauseRoute).toContain("transitionIntent: body?.transitionIntent");
    expect(technicianLabor).toContain(
      "transitionIntent: params.transitionIntent",
    );
    expect(punchTransition).toContain(
      'options?.pause?.transitionIntent === "parts_quote_hold"',
    );
    expect(punchTransition).toContain(
      'normalizedHoldReason !== "awaiting parts quote"',
    );
    expect(punchTransition).toContain(
      "A line with recorded labor cannot be sent to parts as pre-labor work.",
    );
    expect(punchTransition).toContain(
      'rpc.rpc("apply_pre_labor_parts_quote_hold_atomic"',
    );
    expect(staffDecisionMigration).toContain(
      "create or replace function public.apply_pre_labor_parts_quote_hold_atomic",
    );
    const partsHoldBoundary = staffDecisionMigration.indexOf(
      "create or replace function public.apply_pre_labor_parts_quote_hold_atomic",
    );
    const partsHoldWorkOrderLock = staffDecisionMigration.indexOf(
      "from public.work_orders work_order",
      partsHoldBoundary,
    );
    const partsHoldLineLock = staffDecisionMigration.indexOf(
      "from public.work_order_lines line",
      partsHoldBoundary,
    );
    const partsHoldSegmentLock = staffDecisionMigration.indexOf(
      "from public.work_order_line_labor_segments segment",
      partsHoldLineLock,
    );
    const partsHoldLaborAssertion = staffDecisionMigration.indexOf(
      "A line with recorded labor cannot be sent to parts as pre-labor work.",
      partsHoldSegmentLock,
    );
    const partsHoldMutation = staffDecisionMigration.indexOf(
      "update public.work_order_lines",
      partsHoldLaborAssertion,
    );
    expect(partsHoldWorkOrderLock).toBeGreaterThan(partsHoldBoundary);
    expect(partsHoldLineLock).toBeGreaterThan(partsHoldWorkOrderLock);
    expect(partsHoldSegmentLock).toBeGreaterThan(partsHoldLineLock);
    expect(partsHoldLaborAssertion).toBeGreaterThan(partsHoldSegmentLock);
    expect(partsHoldMutation).toBeGreaterThan(partsHoldLaborAssertion);
    expect(
      staffDecisionMigration.slice(partsHoldWorkOrderLock, partsHoldLaborAssertion),
    ).toContain("for update nowait");
    expect(generatedTypes).toContain(
      "apply_pre_labor_parts_quote_hold_atomic: {",
    );
    expect(punchTransition).toContain(
      "partsQuoteHoldRequested\n        ? !capabilities.canManageWorkOrders",
    );
    expect(punchTransition).toContain(
      "!partsQuoteHoldRequested && options?.enforceAssignedWork === true",
    );
    expect(mobileWorkOrder).toContain(
      "const canSendToParts = currentActor.canManageWorkOrders",
    );
    expect(mobileWorkOrder).toContain("partsHoldOperationKeysRef");
    expect(mobileWorkOrder).toContain("partsHoldPendingRef");
    expect(mobileWorkOrder).toContain("partsHoldInFlightRef");
    expect(mobileWorkOrder).toContain("{ operationKey }");
    expect(mobileWorkOrder).toContain("disabled={partsHoldPending}");
    expect(mobileWorkOrder).toContain('"Queued for parts"');
    expect(mobileWorkOrder).toContain(
      "partsHoldOperationKeysRef.current.delete(lineId)",
    );
    expect(mobileWorkOrder).toContain("partsQuoteEligiblePending");
    expect(mobileWorkOrder).toContain("!isCanonicalPartsQuoteHold(line)");
    expect(staffDecisionMigration).toContain(
      "PARTS_QUOTE_HOLD_BUSY: line state is changing; retry the hold.",
    );
    expect(staffDecisionMigration).toContain(
      "A voided or terminal line cannot be sent to parts.",
    );
    expect(staffDecisionMigration).toContain("for share nowait");
    expect(staffDecisionMigration).toContain(
      "actor capability changed before the hold",
    );
  });

  it("isolates assigned-work hardening from the shared completion contract", () => {
    expect(punchTransition).toContain("enforceAssignedWork?: boolean");
    expect(technicianLabor.match(/enforceAssignedWork: true/g)).toHaveLength(2);
    expect(resumeRoute).toContain("enforceAssignedWork: true");
    expect(completeWorkOrderLine).not.toContain("enforceAssignedWork");
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
    expect(punchTransition).toContain("const replayExistingOperation");
    expect(punchTransition.match(/await replayExistingOperation\(\)/g)).toHaveLength(2);
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
