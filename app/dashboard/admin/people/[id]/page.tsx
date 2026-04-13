import PersonDetailClient from "@/features/dashboard/app/dashboard/admin/PersonDetailClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  const { id } = await params;
  const query = await searchParams;
  return <PersonDetailClient personId={id} from={query.from ?? null} />;
}
