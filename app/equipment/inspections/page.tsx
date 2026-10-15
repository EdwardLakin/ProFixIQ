import EquipmentSectionPage from "@/features/equipment/server/EquipmentSectionPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <EquipmentSectionPage section="inspections" />;
}
