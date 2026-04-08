import { redirect } from "next/navigation";

export default async function WorkOrderInvoiceAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/work-orders/invoice/${id}`);
}
