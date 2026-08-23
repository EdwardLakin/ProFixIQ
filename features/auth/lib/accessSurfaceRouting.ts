import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";
import type { FieldServiceAccessDecision } from "@/features/mobile/service/fieldServiceAccessContract";

export type ProductAccessSurface = "shop" | "field" | "fleet" | "customer";

export const PRODUCT_SIGN_IN: Record<ProductAccessSurface, string> = {
  shop: "/shop/sign-in",
  field: "/field/sign-in",
  fleet: `${FLEET_PRODUCT_ORIGIN}/sign-in`,
  customer: "/customer/sign-in",
};

const CONTINUATION_KEYS = [
  "redirect",
  "session_id",
  "flow",
  "demoId",
  "intakeId",
  "activationContext",
  "billing_link_error",
  "email",
  "mode",
  "redirectedFrom",
  "surface",
] as const;

function appendContinuation(
  href: string,
  searchParams: URLSearchParams,
): string {
  const destination = new URL(href, "https://profixiq-routing.invalid");

  for (const key of CONTINUATION_KEYS) {
    for (const value of searchParams.getAll(key)) {
      const trimmed = value.trim();
      if (trimmed) destination.searchParams.append(key, trimmed);
    }
  }

  return href.startsWith("http")
    ? destination.toString()
    : `${destination.pathname}${destination.search}`;
}

function surfaceForLegacyContinuation(
  searchParams: URLSearchParams,
): ProductAccessSurface | null {
  const explicitSurface = searchParams.get("surface")?.trim().toLowerCase();
  if (
    explicitSurface === "shop" ||
    explicitSurface === "field" ||
    explicitSurface === "fleet" ||
    explicitSurface === "customer"
  ) {
    return explicitSurface;
  }

  const redirect = safeInternalRedirect(searchParams.get("redirect"), "");
  if (
    redirect === "/mobile/service" ||
    redirect.startsWith("/mobile/service/")
  ) {
    return "field";
  }
  if (redirect === "/portal/fleet" || redirect.startsWith("/portal/fleet/")) {
    return "fleet";
  }
  if (redirect === "/portal" || redirect.startsWith("/portal/")) {
    return "customer";
  }

  if (searchParams.get("mode")?.trim().toLowerCase() === "mobile") {
    return "shop";
  }

  return CONTINUATION_KEYS.some((key) => searchParams.has(key)) ? "shop" : null;
}

/**
 * Plain `/sign-in` is the neutral access chooser. Legacy continuation URLs are
 * routed to the product-specific form so protected links, account acquisition,
 * and password recovery do not lose their destination.
 */
export function resolveLegacySignInHref(
  searchParams: URLSearchParams,
): string | null {
  const surface = surfaceForLegacyContinuation(searchParams);
  return surface
    ? appendContinuation(PRODUCT_SIGN_IN[surface], searchParams)
    : null;
}

/**
 * Completed self-serve checkout always continues through the shared owner
 * account-setup form. Product-specific sign-in pages remain for existing
 * accounts and invited users; they are not allowed to swallow a new trial.
 */
export function resolveAcquisitionSignupHref(
  searchParams: URLSearchParams,
): string | null {
  const flow = searchParams.get("flow")?.trim();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  if (flow !== "acquisition" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return null;
  }
  return appendContinuation("/signup", searchParams);
}

const FIELD_HOME = "/mobile/service";
const FIELD_SETUP = "/mobile/service/setup";
const PASSWORD_CHANGE = "/auth/set-password";

export type FieldExistingSessionAccess = {
  decision?: FieldServiceAccessDecision;
  canAccessFieldService?: boolean;
  canConfigure?: boolean;
  mustChangePassword?: boolean;
};

/**
 * The API owns security-sensitive Field destinations. A requested Field
 * continuation is applied only after the API returns the normal Field home;
 * forced password changes and setup handoffs must never be overridden.
 */
export function resolveFieldPostSignInHref(
  apiDestination: string,
  requestedDestination: string,
): string {
  const destination = safeInternalRedirect(apiDestination, FIELD_HOME);

  if (
    destination === PASSWORD_CHANGE ||
    destination.startsWith(`${PASSWORD_CHANGE}?`)
  ) {
    return destination;
  }

  if (destination === FIELD_SETUP) return FIELD_SETUP;
  if (destination !== FIELD_HOME) return FIELD_HOME;

  return safeInternalRedirect(requestedDestination, FIELD_HOME, [FIELD_HOME]);
}

/**
 * Existing sessions do not pass through the sign-in API, so the Field access
 * endpoint must supply the password-change flag and this client-side routing
 * decision must enforce it before entering either the workspace or setup.
 */
export function resolveFieldExistingSessionHref(
  access: FieldExistingSessionAccess,
  requestedDestination: string,
): string | null {
  const canOpenSetup =
    requestedDestination === FIELD_SETUP && access.canConfigure === true;
  const fieldDestination = access.decision
    ? access.decision === "ready"
      ? FIELD_HOME
      : access.decision === "setup_required"
        ? FIELD_SETUP
        : access.decision === "forbidden" && canOpenSetup
          ? FIELD_SETUP
          : null
    : access.canAccessFieldService
      ? FIELD_HOME
      : access.canConfigure
        ? FIELD_SETUP
        : null;

  if (!fieldDestination) return null;

  if (requestedDestination === FIELD_SETUP && access.canConfigure !== true) {
    return null;
  }

  const apiEquivalentDestination = access.mustChangePassword
    ? `${PASSWORD_CHANGE}?redirect=${encodeURIComponent(fieldDestination)}`
    : fieldDestination;

  return resolveFieldPostSignInHref(
    apiEquivalentDestination,
    requestedDestination,
  );
}
