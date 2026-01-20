// app/portal/work-orders/[id]/invoice/page.tsx
import { redirect } from "next/navigation";

type Params = {
  id: string;
};

export const dynamic = "force-dynamic";

export default async function PortalWorkOrderInvoiceRedirect({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id: workOrderId } = await params;
  redirect(`/portal/invoices/${workOrderId}`);
}