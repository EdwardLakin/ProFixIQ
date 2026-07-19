import { canonicalizeRole } from "@/features/shared/lib/rbac";

export function resolveInstalledLaunchPath(
  role: string | null | undefined,
  compactViewport: boolean,
): string {
  const canonicalRole = canonicalizeRole(role);

  if (canonicalRole === "customer") return "/portal";

  if (compactViewport) {
    if (canonicalRole === "driver") return "/mobile/fleet/pretrip";
    if (["fleet_manager", "dispatcher"].includes(canonicalRole)) {
      return "/mobile/fleet";
    }
    return "/mobile";
  }

  if (["fleet_manager", "dispatcher", "driver"].includes(canonicalRole)) {
    return "/fleet";
  }
  return "/dashboard";
}
