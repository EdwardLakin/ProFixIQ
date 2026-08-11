import MobileServiceCallHandoff from "@/features/mobile/service/MobileServiceCallHandoff";

export default async function MobileServiceCallHandoffPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  return <MobileServiceCallHandoff visitId={visitId} />;
}
