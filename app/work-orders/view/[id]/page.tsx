export const dynamic = "force-dynamic";
export const revalidate = 0;

import WorkOrderDetailClient from "@work-orders/app/work-orders/view/[id]/WorkOrderDetailClient";

export default function Page({ params }: { params: { id: string } }) {
  return <WorkOrderDetailClient id={params.id} />;
}