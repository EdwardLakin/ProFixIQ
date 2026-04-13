import { Suspense } from "react";
import UsersPageClient from "@/features/dashboard/app/dashboard/admin/UsersPageClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <Suspense fallback={<div className="p-6 text-white">Loading users…</div>}>
      <UsersPageClient />
    </Suspense>
  );
}
