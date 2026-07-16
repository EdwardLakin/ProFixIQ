import { canonicalizeRole } from "@/features/shared/lib/rbac";

export function resolveInstalledLaunchPath(
  role: string | null | undefined,
  compactViewport: boolean,
): string {
  const canonicalRole = canonicalizeRole(role);
  if (canonicalRole === "customer") return "/portal";
  if (["fleet_manager", "dispatcher", "driver"].includes(canonicalRole)) {
    return "/fleet";
  }
  if (compactViewport) return "/mobile";
  return "/dashboard";
}
