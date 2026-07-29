import { InspectionReportAttachments } from "@/features/inspections/components/InspectionReportAttachments";

export default async function PortalInvoiceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      {children}
      <div className="mx-auto max-w-4xl px-4 pb-10">
        <InspectionReportAttachments
          workOrderId={id}
          title="Inspection reports attached to this invoice"
        />
      </div>
    </>
  );
}
