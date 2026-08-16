import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

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
  if (redirect === "/mobile/service" || redirect.startsWith("/mobile/service/")) {
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
