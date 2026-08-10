import MobileServiceCloseout from "@/features/mobile/service/MobileServiceCloseout";

export default async function MobileServiceCloseoutPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  return <MobileServiceCloseout workOrderId={workOrderId} />;
}
