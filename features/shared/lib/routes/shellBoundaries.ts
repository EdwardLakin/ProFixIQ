const STANDALONE_PUBLIC_PREFIXES = [
  "/launch",
  "/offline",
  "/signup",
  "/sign-up",
  "/sign-in",
  "/forgot-password",
  "/auth/reset",
  "/auth/set-password",
  "/auth/callback",
  "/confirm",
  "/compare-plans",
  "/subscribe",
  "/demo",
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
  if (matchesRoutePrefix(pathname, "/coming-soon")) return true;
  return pathname === "/auth" || pathname.startsWith("/auth/");
}
