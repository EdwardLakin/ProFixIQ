import { InspectionReportAttachments } from "@/features/inspections/components/InspectionReportAttachments";

export default async function PortalWorkOrderLayout({
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
      <div className="mx-auto max-w-5xl px-4 pb-8">
        <InspectionReportAttachments workOrderId={id} />
      </div>
    </>
  );
}
