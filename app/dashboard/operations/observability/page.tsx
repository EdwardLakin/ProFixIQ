import OperationalObservabilityWorkspace from "@/features/operations/components/OperationalObservabilityWorkspace";
import { OperationalViewSwitcher } from "@/features/dashboard/components/OperationalViewSwitcher";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function OperationalObservabilityPage() {
  const { profile } = await requireShopPageAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager"],
  });

  return (
    <main className="w-full space-y-4">
      <OperationalViewSwitcher role={profile.role} />

      <header className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-4 md:px-6 md:py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-200">
          Operational intelligence
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[color:var(--theme-text-primary)]">
          Observability
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
          Verify that shop activity is reaching one tenant-safe event stream, inspect failures without interrupting technicians, and review AI operating health.
        </p>
      </header>

      <OperationalObservabilityWorkspace />
    </main>
  );
}
