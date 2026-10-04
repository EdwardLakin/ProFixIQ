// app/portal/parts-quotes/[id]/page.tsx
import PortalPartsQuoteClient from "@/features/portal/components/parts-quotes/PortalPartsQuoteClient";

export const dynamic = "force-dynamic";

export default async function PortalPartsQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PortalPartsQuoteClient quoteId={id} />;
}
