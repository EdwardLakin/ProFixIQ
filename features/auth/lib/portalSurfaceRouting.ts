import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";

export type PortalSurface = "customer" | "fleet";

export const PORTAL_HOME: Record<PortalSurface, string> = {
  customer: "/portal",
  fleet: "/portal/fleet",
};

export const PORTAL_SIGN_IN: Record<PortalSurface, string> = {
  customer: "/portal/auth/sign-in",
  fleet: "/portal/auth/fleet-sign-in",
};

function isFleetPortalPath(path: string): boolean {
  return (
    path === "/portal/fleet" ||
    path.startsWith("/portal/fleet/") ||
    path.startsWith("/portal/fleet?")
  );
}

export function isPortalPathForSurface(
  path: string | null | undefined,
  surface: PortalSurface,
): boolean {
  const safePath = safeInternalRedirect(path, "", ["/portal"]);
  if (!safePath) return false;

  return surface === "fleet"
    ? isFleetPortalPath(safePath)
    : !isFleetPortalPath(safePath);
}

export function resolvePortalSurfaceRedirect(
  requested: string | null | undefined,
  fallback: string,
  surface: PortalSurface,
): string {
  return isPortalPathForSurface(requested, surface)
    ? String(requested).trim()
    : fallback;
}
