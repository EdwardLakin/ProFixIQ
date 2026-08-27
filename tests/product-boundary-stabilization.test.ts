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
    expect(access).toContain("resolveWorkOrderProductAuthority");
    expect(detail).toContain("resolveWorkOrderProductAuthority");
    expect(punches).toContain("resolveWorkOrderProductAuthority");
    expect(punches).toContain('from("workforce_operation_keys")');
    expect(queue).toContain('"/api/mobile/work-orders/scope"');
    expect(queue).toContain('query.in("id", fieldWorkOrderIds)');
    expect(queue).toContain("getCachedMobileProductScope");
    expect(queue).toContain("reconcileMobileProductScope");
    expect(queue).toContain("authorizedWorkOrderIds: fieldWorkOrderIds");
    expect(queue).toContain(
      'cached.data.fieldScoped === (cachedProductScope === "field")',
    );
    expect(evidence).toContain("resolveShopProductAccess");
    expect(evidence).toContain("canFieldOperatorAccessWorkOrder");
    expect(evidence).toContain("resolveFleetActorContext");
    expect(evidence).toContain("canAccessPortalFleetWrappers");
    expect(offlineMutations).toContain("resolveWorkOrderProductAuthority");
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

  it("keeps shared Field navigation and data projections relationship-scoped", () => {
    const middleware = read("middleware.ts");
    const dispatch = read("features/dispatch/server/productScope.ts");
    const cache = read(
      "features/work-orders/mobile/mobileProductScopeStorage.ts",
    );
    const parts = read("features/parts/mobile/MobilePartsWorkflow.tsx");

    expect(middleware).toContain('pathname.startsWith("/mobile/jobs/")');
    expect(dispatch).toContain("getMobileFieldServiceAccess");
    expect(dispatch).toContain("fieldAccess.canAccessFieldService");
    expect(cache).toContain("authorizedWorkOrderIds");
    expect(cache).toContain("!sameIds");
    expect(parts).toContain('fetch("/api/mobile/work-orders/scope"');
    expect(parts).toContain('requestQuery.in(\n          "work_order_id"');
    expect(parts).toContain('productScope === "shop"');
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
    expect(setPassword).toContain('searchParams.get("surface") === "field"');
    expect(setPassword).toContain("FIELD_PRODUCT_CAPABILITIES");
    expect(setPassword).toContain('searchParams.get("surface") === "billing"');

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

    const intake = read("app/api/work-orders/[id]/intake/route.ts");
    expect(intake).toContain("resolveIntakeAccess");
    expect(intake).toContain("requirePortalCustomerActor");
    expect(intake).toContain("resolveFleetActorContext");
    expect(intake).toContain("actor.fleetMemberships.some");
    expect(intake).toContain("membership.shopId === workOrder.shop_id");
    expect(intake).toContain("SHOP_PRODUCT_CAPABILITIES");

    for (const sharedApi of [
      "app/api/openai/realtime-token/route.ts",
      "app/api/inspection-form-imports/route.ts",
      "app/api/parts/requests/create/route.ts",
      "app/api/parts/requests/queue/route.ts",
      "app/api/work-orders/quotes/[id]/authorize/route.ts",
      "app/api/work-orders/quotes/[id]/decline/route.ts",
    ]) {
      expect(read(sharedApi)).toContain("SHOP_OR_FIELD_PRODUCT_CAPABILITIES");
    }

    for (const shopBookingApi of [
      "app/api/portal/bookings/route.ts",
      "app/api/portal/bookings/[id]/route.ts",
    ]) {
      expect(read(shopBookingApi)).toContain("SHOP_PRODUCT_CAPABILITIES");
      expect(read(shopBookingApi)).not.toContain(
        "SHOP_OR_FIELD_PRODUCT_CAPABILITIES",
      );
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
