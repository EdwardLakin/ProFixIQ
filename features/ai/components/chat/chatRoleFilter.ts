import {
  canonicalizeRole,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";

export type ChatRoleFilter = "all" | CanonicalRole;

export function matchesChatRole(
  userRole: string | null | undefined,
  filter: ChatRoleFilter,
): boolean {
  return filter === "all" || canonicalizeRole(userRole) === filter;
}

export function workOrderChatRoleFilter(
  currentUserRole: string | null | undefined,
): ChatRoleFilter | null {
  const canonicalRole = canonicalizeRole(currentUserRole);
  if (canonicalRole === "mechanic") return "advisor";
  if (canonicalRole === "advisor") return "mechanic";
  return null;
}
