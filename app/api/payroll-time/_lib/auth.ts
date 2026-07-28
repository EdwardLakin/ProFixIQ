import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function requirePayrollReviewer(options?: { finalize?: boolean }) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: options?.finalize
      ? "canFinalizeWorkforceTime"
      : "canReviewWorkforceTime",
  });
  if (!access.ok) return access;

  return {
    ok: true as const,
    me: access.profile,
    authUserId: access.authUserId,
    supabase: access.supabase,
  };
}
