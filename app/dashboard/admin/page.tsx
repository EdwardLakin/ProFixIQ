import AdminLandingClient from "@/features/dashboard/app/dashboard/admin/AdminLandingClient";
import { AdminPageShell } from "@/features/dashboard/app/dashboard/admin/AdminSurface";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function AdminLandingPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <AdminPageShell>
      <AdminLandingClient />
    </AdminPageShell>
  );
}
