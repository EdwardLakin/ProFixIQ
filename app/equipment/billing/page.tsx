import EquipmentPlannedPage from "@/features/equipment/server/EquipmentPlannedPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EquipmentBillingPage() {
  return <EquipmentPlannedPage itemKey="billing" />;
}
