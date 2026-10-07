const STANDALONE_PUBLIC_PREFIXES = [
  "/launch",
  "/offline",
  "/signup",
  "/sign-up",
  "/sign-in",
  "/shop/sign-in",
  "/field/sign-in",
  "/customer/sign-in",
  "/onboarding",
  "/forgot-password",
  "/auth/reset",
  "/auth/set-password",
  "/auth/callback",
  "/confirm",
  "/compare/fullbay-alternative",
  "/compare/profixiq-vs-fullbay",
  "/compare-plans",
  "/subscribe",
  "/demo",
  "/early-access",
  "/field-service",
  "/fleet-maintenance",
  "/fleet-repair-management-software",
  "/dvir-defect-tracking-software",
  "/fleet-preventive-maintenance-software",
  "/mobile-truck-repair-software",
  "/service-truck-work-order-software",
  "/heavy-equipment-repair-software",
  "/off-highway-equipment-repair-software",
  "/heavy-duty-shop-management-software",
  "/diesel-repair-shop-software",
  "/heavy-duty-work-order-software",
  "/heavy-duty-inspection-software",
  "/portal/auth",
  "/portal/join",
  "/portal/confirm",
] as const;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Routes whose page owns the full viewport and must never inherit app chrome. */
export function isStandalonePublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (matchesRoutePrefix(pathname, "/mobile/sign-in")) return true;
  return STANDALONE_PUBLIC_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

/** Routes rendered by a dedicated surface shell instead of the desktop dashboard shell. */
export function isOutsideDesktopAppShell(pathname: string): boolean {
  if (isStandalonePublicRoute(pathname)) return true;
  if (matchesRoutePrefix(pathname, "/portal")) return true;
  if (matchesRoutePrefix(pathname, "/mobile")) return true;
  if (matchesRoutePrefix(pathname, "/ops")) return true;
  if (matchesRoutePrefix(pathname, "/coming-soon")) return true;
  return pathname === "/auth" || pathname.startsWith("/auth/");
}
