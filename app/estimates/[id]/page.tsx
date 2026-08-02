export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound } from "next/navigation";
import { z } from "zod";
import EstimateBuilder from "@/features/estimates/components/EstimateBuilder";
import { ESTIMATE_VIEW_ROLES } from "@/features/estimates/lib/access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireShopPageAccess({ allowRoles: ESTIMATE_VIEW_ROLES });
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!parsed.success) notFound();

  return <EstimateBuilder estimateId={parsed.data} />;
}
