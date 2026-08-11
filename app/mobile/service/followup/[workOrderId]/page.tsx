import MobileServiceFollowup from "@/features/mobile/service/MobileServiceFollowup";

export default async function MobileServiceFollowupPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  return <MobileServiceFollowup workOrderId={workOrderId} />;
}
