export type ProductRouteBoundary = "shop" | "field" | "shared" | null;

function isSharedShopFieldRoute(pathname: string): boolean {
  if (
    pathname === "/launch" ||
    pathname === "/offline" ||
    pathname.startsWith("/offline/") ||
    pathname === "/mobile/offline" ||
    pathname.startsWith("/mobile/offline/") ||
    pathname === "/mobile/appointments" ||
    pathname.startsWith("/mobile/appointments/") ||
    pathname === "/mobile/inspections" ||
    pathname.startsWith("/mobile/inspections/") ||
    pathname === "/mobile/parts" ||
    pathname.startsWith("/mobile/parts/") ||
    /^\/mobile\/jobs\/[^/]+$/.test(pathname)
  ) {
    return true;
  }

  return (
    pathname === "/mobile/work-orders" ||
    pathname === "/mobile/work-orders/create" ||
    /^\/mobile\/work-orders\/[^/]+$/.test(pathname)
  );
}

export function resolveProductRouteBoundary(input: {
  pathname: string;
  fleetProductRequest: boolean;
  opsProductRequest: boolean;
}): ProductRouteBoundary {
  const { pathname, fleetProductRequest, opsProductRequest } = input;

  if (
    fleetProductRequest ||
    opsProductRequest ||
    pathname.startsWith("/portal")
  ) {
    return null;
  }
  if (
    pathname === "/account/billing" ||
    pathname.startsWith("/account/billing/") ||
    pathname.startsWith("/onboarding") ||
    pathname === "/dashboard/owner/fleet-access" ||
    pathname.startsWith("/dashboard/owner/fleet-access/")
  ) {
    return null;
  }
  if (
    pathname === "/mobile/service" ||
    pathname.startsWith("/mobile/service/")
  ) {
    return "field";
  }
  if (isSharedShopFieldRoute(pathname)) return "shared";
  return "shop";
}
