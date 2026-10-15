import EquipmentSectionPage from "@/features/equipment/server/EquipmentSectionPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <EquipmentSectionPage section="fluid-analysis" searchParams={(await searchParams) ?? {}} />;
}
