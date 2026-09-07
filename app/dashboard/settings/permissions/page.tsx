import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import RolePermissionsPanel from "@/features/workspace/authorization/components/RolePermissionsPanel";

export const dynamic = "force-dynamic";

/**
 * Roles & permissions for a delegated permission administrator.
 *
 * Owner Settings renders the same panel inside its own section. This route
 * exists so an employee who holds team.permissions.manage without being an
 * owner/admin can administer role policy without being given the rest of
 * Owner Settings.
 */
export default async function ShopPermissionsSettingsPage() {
  await requireShopPageAccess({
    requiredWorkspaceCapability: WORKSPACE_CAPABILITIES.manageTeamPermissions,
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
          Roles &amp; permissions
        </h1>
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          Set what each role can do in this shop. Individual exceptions live on
          the employee record in Workforce.
        </p>
      </header>
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-soft)] sm:p-5">
        <RolePermissionsPanel />
      </section>
    </div>
  );
}
