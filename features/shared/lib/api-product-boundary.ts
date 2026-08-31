import type { ProductCapability } from "@/features/stripe/lib/stripe/product-packages";
import {
  FIELD_PRODUCT_CAPABILITIES,
  FLEET_PRODUCT_CAPABILITIES,
  SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";

export type ApiProductBoundary =
  | { kind: "route_owned" }
  | { kind: "account_recovery" }
  | { kind: "product"; capabilities: readonly ProductCapability[] };

function atOrBelow(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isRouteOwnedApi(pathname: string): boolean {
  if (
    [
      "/api/auth",
      "/api/demo",
      "/api/fleet",
      "/api/internal",
      "/api/onboarding",
      "/api/onboarding-v2",
      "/api/portal",
      "/api/webhooks",
    ].some((prefix) => atOrBelow(pathname, prefix))
  ) {
    return true;
  }

  return (
    [
      "/api/diag/log",
      "/api/branding/active",
      "/api/dashboard/layout",
      "/api/quotes/approval-webhook",
      "/api/stripe/checkout/acquisition-context",
      "/api/stripe/checkout/link-user",
      "/api/stripe/checkout/webhook",
      "/api/stripe/connect/webhook",
      "/api/stripe/link-user",
      "/api/stripe/webhook",
    ].includes(pathname) ||
    /^\/api\/invoice-versions\/[^/]+\/pdf$/.test(pathname) ||
    /^\/api\/invoices\/[^/]+\/documents\/[^/]+\/signed$/.test(pathname) ||
    /^\/api\/inspections\/[^/]+\/report\/pdf$/.test(pathname) ||
    pathname === "/api/inspections/reports" ||
    /^\/api\/work-orders\/[^/]+\/(intake|invoice-pdf|media)$/.test(pathname) ||
    /^\/api\/work-orders\/lines\/[^/]+\/approval-decision$/.test(pathname) ||
    /^\/api\/work-orders\/quotes\/[^/]+\/(approval|approval-decision)$/.test(
      pathname,
    )
  );
}

function isSharedShopFieldPortalApi(pathname: string): boolean {
  return pathname === "/api/portal/book";
}

function isShopPortalStaffApi(pathname: string): boolean {
  return ["/api/portal/qr/campaign", "/api/portal/send-invite"].includes(
    pathname,
  );
}

function isFleetPortalStaffApi(pathname: string): boolean {
  return pathname === "/api/portal/fleet/invites";
}

function isAccountRecoveryApi(pathname: string): boolean {
  return (
    [
      "/api/stripe/checkout",
      "/api/stripe/portal",
      "/api/stripe/session",
      "/api/stripe/subscription",
    ].includes(pathname) || atOrBelow(pathname, "/api/shop/owner-pin")
  );
}

function isFieldApi(pathname: string): boolean {
  return (
    atOrBelow(pathname, "/api/mobile/field-service") ||
    atOrBelow(pathname, "/api/mobile/service") ||
    atOrBelow(pathname, "/api/mobile/service-visits")
  );
}

function isShopOrFieldApi(pathname: string): boolean {
  if (
    [
      "/api/dispatch",
      "/api/generate-inspection",
      "/api/inspection",
      "/api/inspection-form-imports",
      "/api/inspections",
      "/api/parts",
    ].some((prefix) => atOrBelow(pathname, prefix))
  ) {
    return true;
  }

  if (
    [
      "/api/invoices/finalize",
      "/api/mobile/shifts",
      "/api/offline/mutations",
      "/api/offline/session-check",
      "/api/offline/technician-work-orders",
      "/api/openai/realtime-token",
      "/api/payments/manual",
      "/api/receive-scan",
      "/api/work-order-lines/operational",
    ].includes(pathname)
  ) {
    return true;
  }

  return (
    atOrBelow(pathname, "/api/mobile/work-orders") ||
    /^\/api\/work-order-lines\/[^/]+\/workspace-detail$/.test(pathname) ||
    /^\/api\/work-orders\/quotes\/[^/]+\/(authorize|decline)$/.test(pathname) ||
    /^\/api\/work-orders\/lines\/[^/]+\/(start|pause|resume|finish)$/.test(
      pathname,
    )
  );
}

/**
 * Every authenticated staff API is Shop-owned unless this contract assigns a
 * narrower non-operational or alternate-product boundary. Route-owned APIs
 * must enforce their own non-Shop identity/relationship contract.
 */
export function resolveApiProductBoundary(
  pathname: string,
): ApiProductBoundary {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (!atOrBelow(normalized, "/api")) return { kind: "route_owned" };
  if (isSharedShopFieldPortalApi(normalized)) {
    return {
      kind: "product",
      capabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
    };
  }
  if (isShopPortalStaffApi(normalized)) {
    return { kind: "product", capabilities: SHOP_PRODUCT_CAPABILITIES };
  }
  if (isFleetPortalStaffApi(normalized)) {
    return { kind: "product", capabilities: FLEET_PRODUCT_CAPABILITIES };
  }
  if (isRouteOwnedApi(normalized)) return { kind: "route_owned" };
  if (isAccountRecoveryApi(normalized)) return { kind: "account_recovery" };
  if (isFieldApi(normalized)) {
    return { kind: "product", capabilities: FIELD_PRODUCT_CAPABILITIES };
  }
  if (isShopOrFieldApi(normalized)) {
    return {
      kind: "product",
      capabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
    };
  }
  return { kind: "product", capabilities: SHOP_PRODUCT_CAPABILITIES };
}
