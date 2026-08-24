import InvoicePreviewPageClient from "@/features/work-orders/components/InvoicePreviewPageClient";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

export default async function WorkOrderInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  await requireShopPageAccess({
    requiredWorkspaceCapability:
      WORKSPACE_CAPABILITIES.viewWorkOrderInvoice,
  });

  const { id } = await params;
  return <InvoicePreviewPageClient workOrderId={id} />;
}
