// app/work-orders/view/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import WorkOrderDetailClient from "@work-orders/app/work-orders/view/[id]//WorkOrderDetailClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // <-- Next 15: params is a Promise
  return <WorkOrderDetailClient id={id} />;
}