import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveApiProductBoundary } from "@/features/shared/lib/api-product-boundary";

const read = (path: string) => readFileSync(path, "utf8");

describe("product boundary stabilization", () => {
  it("uses a server-verified checkout only as a handoff to the atomic acquisition claim", () => {
    const signIn = read("app/api/auth/sign-in/route.ts");
    const verifier = read(
      "features/stripe/lib/server/stripe-acquisition-intent.ts",
    );

    expect(signIn).toContain("verifyStripeAcquisitionCheckout");
    expect(signIn).toContain("verified.email !== authenticatedEmail");
    expect(signIn).toContain(
      'return NextResponse.json({ ok: true, destination: "/onboarding" })',
    );
    expect(verifier).toContain("isCompletedStripeAcquisitionSession(session)");
    expect(verifier).toContain("priceId !== metadata.priceId");
    expect(verifier).toContain(
      "isStripeSubscriptionAccessBearing(subscription.status)",
    );
  });

  it("keeps billing recovery narrow, role protected, and independent of operational products", () => {
    const page = read("app/account/billing/page.tsx");
    const client = read("features/stripe/components/BillingRecoveryClient.tsx");
    const auth = read("app/api/auth/sign-in/route.ts");

    expect(page).toContain('allowRoles: ["owner", "admin"]');
    expect(page).toContain('requiredCapability: "canManageBilling"');
    expect(page).toContain("requiredProductCapabilities: []");
    expect(client).toContain('fetch("/api/stripe/subscription"');
    expect(client).toContain('fetch("/api/stripe/portal"');
    expect(client).toContain("purpose={OWNER_PIN_PURPOSES.BILLING}");
    expect(client).not.toContain("work_orders");
    expect(auth).toContain("ACCOUNT_BILLING_RECOVERY_HREF");

    for (const route of [
      "app/api/stripe/checkout/route.ts",
      "app/api/stripe/portal/route.ts",
      "app/api/stripe/session/route.ts",
      "app/api/stripe/subscription/route.ts",
    ]) {
      expect(read(route)).toContain("requiredProductCapabilities: []");
    }

    const ownerPinVerify = read("app/api/shop/owner-pin/verify/route.ts");
    expect(ownerPinVerify).toContain("purpose !== OWNER_PIN_PURPOSES.BILLING");
  });

  it("preserves linked Field Work Order reads and assigned job execution", () => {
    const access = read("features/mobile/service/server/access.ts");
    const detail = read("app/api/mobile/work-orders/[id]/route.ts");
    const punches = read(
      "features/work-orders/server/authorizeJobPunchTransition.ts",
    );
    const queue = read("features/mobile/work-orders/MobileWorkOrderQueue.tsx");
    const evidence = read(
      "features/work-orders/server/authorizeWorkOrderEvidence.ts",
    );
    const offlineMutations = read("app/api/offline/mutations/route.ts");
    const offlineBundle = read(
      "app/api/offline/technician-work-orders/route.ts",
    );
    const offlineBundleSelector = read(
      "features/work-orders/mobile/server/selectAuthorizedAssignedWorkOrderIds.ts",
    );

    expect(access).toContain('.eq("mode", "mobile")');
    expect(access).toContain("canManageLinkedFieldWork");
    expect(access).toContain("canFieldActorAccessWorkOrder");
    expect(access).toContain("resolveWorkOrderProductAuthority");
    expect(detail).toContain("resolveWorkOrderProductAuthority");
    expect(punches).toContain("resolveWorkOrderProductAuthority");
    expect(punches).toContain(
      "`${line.shop_id}:job-punch:${input.operationKey}`",
    );
    expect(queue).toContain('"/api/mobile/work-orders/scope"');
    expect(queue).toContain('query.in("id", fieldWorkOrderIds)');
    expect(queue).toContain("getCachedMobileProductScope");
    expect(queue).toContain("reconcileMobileProductScope");
    expect(queue).toContain(
      'cached.data.fieldScoped === (cachedProductScope === "field")',
    );
    expect(evidence).toContain("resolveShopProductAccess");
    expect(evidence).toContain("canFieldOperatorAccessWorkOrder");
    expect(evidence).toContain("resolveFleetActorContext");
    expect(evidence).toContain("canAccessPortalFleetWrappers");
    expect(offlineMutations).toContain("resolveWorkOrderProductAuthority");
    expect(offlineMutations).toContain("createAdminSupabase");
    expect(offlineMutations).toContain('from("offline_mutation_receipts")');
    expect(offlineMutations).toContain(
      '.eq("actor_user_id", access.authUserId)',
    );
    expect(
      offlineMutations.indexOf('from("offline_mutation_receipts")'),
    ).toBeLessThan(offlineMutations.indexOf('from("work_order_lines")'));
    expect(offlineBundle).toContain("listFieldOperatorAssignedWorkOrderIds");
    expect(offlineBundle).toContain("selectAuthorizedAssignedWorkOrderIds");
    expect(offlineBundleSelector).toContain(
      "fieldWorkOrderIds.has(workOrderId)",
    );

    const inspections = read("app/mobile/inspections/page.tsx");
    expect(inspections).toContain('"/api/mobile/work-orders/scope"');
    expect(inspections).toContain(
      'query.in("work_order_id", productScope.workOrderIds)',
    );

    const inspectionExecutionAccess = read(
      "features/inspections/server/inspectionExecutionProductAccess.ts",
    );
    expect(inspectionExecutionAccess).toContain(
      "resolveWorkOrderProductAuthority",
    );
    expect(inspectionExecutionAccess).toContain("SHOP_PRODUCT_CAPABILITIES");
    for (const route of [
      "app/api/inspections/save/route.ts",
      "app/api/inspections/load/route.ts",
      "app/api/inspections/finalize/pdf/route.ts",
      "app/api/inspections/reopen/route.ts",
      "app/api/inspections/sign/route.ts",
      "app/api/inspections/photos/upload/route.ts",
    ]) {
      expect(read(route)).toContain("canExecuteInspectionForProduct");
    }
  });

  it("does not let a Field role become standard tenant-wide invoice authority", () => {
    const finalize = read("app/api/invoices/finalize/route.ts");

    expect(finalize).toContain("resolveWorkOrderProductAuthority");
    expect(finalize).toMatch(
      /const standardInvoiceAuthority\s*=\s*productAuthority\.product === "shop"/,
    );
    expect(finalize).toContain(
      'const mobileFieldAuthority = productAuthority.product === "field"',
    );
  });

  it("retains Field entitlement through forgot and forced password setup", () => {
    const signIn = read("app/api/auth/sign-in/route.ts");
    const setPassword = read("app/auth/set-password/page.tsx");
    const routing = read("features/auth/lib/accessSurfaceRouting.ts");

    expect(signIn).toContain("/auth/set-password?surface=field&redirect=");
    expect(routing).toContain(
      "`${PASSWORD_CHANGE}?surface=field&redirect=${encodeURIComponent(fieldDestination)}`",
    );
    expect(setPassword).toContain('passwordSurface === "field"');
    expect(setPassword).toContain("FIELD_PRODUCT_CAPABILITIES");
    expect(setPassword).toContain('passwordSurface === "billing"');

    for (const client of [
      read("features/auth/components/SignIn.tsx"),
      read("app/mobile/sign-in/page.tsx"),
      read("app/portal/auth/sign-in/PortalSignInForm.tsx"),
    ]) {
      expect(client).toContain(
        'result.destination.startsWith("/auth/set-password")',
      );
    }
    expect(signIn).toContain("billingRecoveryDestination");
    expect(signIn).toMatch(
      /surface === "fleet"[\s\S]+billingRecoveryDestination/,
    );
    expect(signIn).toMatch(
      /surface === "field"[\s\S]+billingRecoveryDestination/,
    );
  });

  it("defaults staff APIs to Shop and explicitly classifies alternate product contracts", () => {
    expect(resolveApiProductBoundary("/api/admin/users")).toEqual({
      kind: "product",
      capabilities: ["shop"],
    });
    expect(resolveApiProductBoundary("/api/offline/mutations")).toEqual({
      kind: "product",
      capabilities: ["shop", "field_service"],
    });
    expect(resolveApiProductBoundary("/api/inspection/save")).toEqual({
      kind: "product",
      capabilities: ["shop", "field_service"],
    });
    expect(resolveApiProductBoundary("/api/ai/interpret")).toEqual({
      kind: "product",
      capabilities: ["shop", "field_service"],
    });
    expect(
      resolveApiProductBoundary("/api/work-orders/import-from-inspection"),
    ).toEqual({
      kind: "product",
      capabilities: ["shop", "field_service"],
    });
    for (const action of ["authorize", "decline"]) {
      expect(
        resolveApiProductBoundary(`/api/work-orders/quotes/quote-1/${action}`),
      ).toEqual({
        kind: "product",
        capabilities: ["shop", "field_service"],
      });
    }
    expect(resolveApiProductBoundary("/api/mobile/service/intake")).toEqual({
      kind: "product",
      capabilities: ["field_service"],
    });
    expect(
      resolveApiProductBoundary(
        "/api/mobile/service-visits/visit-1/transition",
      ),
    ).toEqual({ kind: "route_owned" });
    for (const sharedPartsPath of [
      "/api/parts/consume",
      "/api/parts/locations",
      "/api/parts/picker",
      "/api/parts/purchase-orders/mobile-snapshot",
      "/api/parts/purchase-orders/po-1/place",
      "/api/parts/purchase-orders/po-1/lines/line-1/receive-free-text",
      "/api/parts/receiving/receive-item",
      "/api/parts/requests/queue",
      "/api/parts/requests/items/item-1/add",
      "/api/parts/requests/items/item-1/allocate",
      "/api/parts/requests/items/item-1/inventory",
      "/api/parts/requests/items/item-1/po-line",
      "/api/parts/requests/items/item-1/receive",
      "/api/parts/items/item-1/receive",
      "/api/parts/vendors",
      "/api/work-orders/wo-1/lines",
    ]) {
      expect(resolveApiProductBoundary(sharedPartsPath)).toEqual({
        kind: "product",
        capabilities: ["shop", "field_service"],
      });
    }
    for (const shopPartsPath of [
      "/api/parts/requests/create",
      "/api/parts/requests/items/item-1/edit",
    ]) {
      expect(resolveApiProductBoundary(shopPartsPath)).toEqual({
        kind: "product",
        capabilities: ["shop"],
      });
    }
    expect(resolveApiProductBoundary("/api/fleet/units")).toEqual({
      kind: "route_owned",
    });
    expect(resolveApiProductBoundary("/api/stripe/portal")).toEqual({
      kind: "account_recovery",
    });
    expect(resolveApiProductBoundary("/api/work-orders/wo-1/media")).toEqual({
      kind: "route_owned",
    });
    expect(
      resolveApiProductBoundary(
        "/api/work-orders/lines/line-1/approval-decision",
      ),
    ).toEqual({ kind: "route_owned" });
    expect(
      resolveApiProductBoundary(
        "/api/work-orders/quotes/quote-1/approval-decision",
      ),
    ).toEqual({ kind: "route_owned" });
    expect(
      resolveApiProductBoundary(
        "/api/invoices/invoice-1/documents/invoice_pdf/signed",
      ),
    ).toEqual({ kind: "route_owned" });
    expect(resolveApiProductBoundary("/api/inspections/reports")).toEqual({
      kind: "route_owned",
    });
    expect(
      resolveApiProductBoundary("/api/inspections/inspection-1/report/pdf"),
    ).toEqual({ kind: "route_owned" });
    expect(resolveApiProductBoundary("/api/work-orders/wo-1/intake")).toEqual({
      kind: "route_owned",
    });
    expect(
      resolveApiProductBoundary("/api/work-orders/wo-1/invoice-pdf"),
    ).toEqual({ kind: "route_owned" });
    expect(resolveApiProductBoundary("/api/receive-scan")).toEqual({
      kind: "product",
      capabilities: ["shop", "field_service"],
    });
    expect(resolveApiProductBoundary("/api/payments/manual/reverse")).toEqual({
      kind: "product",
      capabilities: ["shop"],
    });
    expect(resolveApiProductBoundary("/api/portal/bookings/booking-1")).toEqual(
      { kind: "route_owned" },
    );
    expect(resolveApiProductBoundary("/api/portal/qr/campaign")).toEqual({
      kind: "product",
      capabilities: ["shop"],
    });
    expect(resolveApiProductBoundary("/api/mobile/shifts")).toEqual({
      kind: "product",
      capabilities: ["shop", "field_service"],
    });
    for (const quoteCreationPath of [
      "/api/work-orders/quotes/add",
      "/api/work-orders/quotes/add-from-menu-repair",
    ]) {
      expect(resolveApiProductBoundary(quoteCreationPath)).toEqual({
        kind: "product",
        capabilities: ["shop", "field_service"],
      });
    }
    expect(resolveApiProductBoundary("/api/portal/fleet/invites")).toEqual({
      kind: "product",
      capabilities: ["fleet_maintenance"],
    });
    expect(resolveApiProductBoundary("/api/portal/approvals")).toEqual({
      kind: "route_owned",
    });
    expect(resolveApiProductBoundary("/api/dashboard/layout")).toEqual({
      kind: "route_owned",
    });
    expect(resolveApiProductBoundary("/api/inspections/sign")).toEqual({
      kind: "route_owned",
    });
    expect(resolveApiProductBoundary("/api/chat/conversations")).toEqual({
      kind: "route_owned",
    });

    const dispatchScope = read("features/dispatch/server/productScope.ts");
    expect(dispatchScope).toContain("getMobileFieldServiceAccess");
    expect(dispatchScope).toContain("fieldAccess.canAccessFieldService");

    const setPassword = read("app/auth/set-password/page.tsx");
    expect(setPassword).toMatch(
      /requiredProductCapabilities:\s*isPortalPasswordFlow\s*\? \[\]/,
    );
    expect(setPassword).toContain('passwordSurface === "customer"');
    expect(setPassword).toContain('passwordSurface === "fleet"');

    const intake = read("app/api/work-orders/[id]/intake/route.ts");
    expect(intake).toContain("resolveIntakeAccess");
    expect(intake).toContain("requirePortalCustomerActor");
    expect(intake).toContain("resolveFleetActorContext");
    expect(intake).toContain("actor.fleetMemberships.some");
    expect(intake).toContain("membership.shopId === workOrder.shop_id");
    expect(intake).toContain("SHOP_PRODUCT_CAPABILITIES");

    for (const canonicalSharedApi of [
      "app/api/openai/realtime-token/route.ts",
      "app/api/portal/bookings/route.ts",
      "app/api/portal/bookings/[id]/route.ts",
      "app/api/inspection-form-imports/route.ts",
      "app/api/inspection-form-imports/[jobId]/route.ts",
      "app/api/inspection-form-imports/[jobId]/approve/route.ts",
      "app/api/parts/requests/items/[itemId]/inventory/route.ts",
      "app/api/mobile/shifts/route.ts",
      "app/api/portal/book/route.ts",
      "app/api/parts/consume/route.ts",
      "app/api/parts/picker/route.ts",
      "app/api/parts/requests/items/[itemId]/add/route.ts",
      "app/api/work-orders/[id]/lines/route.ts",
      "app/api/inspections/build-from-prompt/route.ts",
      "app/api/work-orders/quotes/add/route.ts",
      "app/api/work-orders/quotes/add-from-menu-repair/route.ts",
    ]) {
      expect(read(canonicalSharedApi)).toContain(
        "requireCanonicalShopOrFieldApiAccess",
      );
    }

    for (const quoteCreationApi of [
      "app/api/work-orders/quotes/add/route.ts",
      "app/api/work-orders/quotes/add-from-menu-repair/route.ts",
    ]) {
      const source = read(quoteCreationApi);
      expect(source).toContain("resolveWorkOrderProductMutationClient");
      expect(source).toContain("mutationClient");
    }

    for (const sharedApi of [
      "app/api/parts/requests/create/route.ts",
      "app/api/parts/requests/queue/route.ts",
      "app/api/work-orders/quotes/[id]/authorize/route.ts",
      "app/api/work-orders/quotes/[id]/decline/route.ts",
    ]) {
      expect(read(sharedApi)).toContain("SHOP_OR_FIELD_PRODUCT_CAPABILITIES");
    }

    for (const quoteDecisionApi of [
      "app/api/work-orders/quotes/[id]/authorize/route.ts",
      "app/api/work-orders/quotes/[id]/decline/route.ts",
    ]) {
      expect(read(quoteDecisionApi)).toContain(
        "resolveWorkOrderProductAuthority",
      );
    }
  });
});
