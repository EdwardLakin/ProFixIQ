import MaintenanceMappingsAdmin from "@/features/maintenance/components/MaintenanceMappingsAdmin";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function OwnerMaintenanceMappingsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <div className="w-full px-4 py-6 xl:px-6">
      <MaintenanceMappingsAdmin />
    </div>
  );
}
