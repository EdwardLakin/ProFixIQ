import PersonDetailClient from "@/features/dashboard/app/dashboard/admin/PersonDetailClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

type PageProps = { params: Promise<{ id: string }> };

export default async function Page({ params }: PageProps) {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  const { id } = await params;
  return <PersonDetailClient personId={id} />;
}
