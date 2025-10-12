// app/work-orders/preview/[id]/page.tsx
import WorkOrderPreview from "app/work-orders/components/WorkOrderPreview";

type PageProps = { params: { id: string } };

export default async function PreviewPage({ params }: PageProps) {
  const { id } = params;

  return (
    <div className="p-4 bg-neutral-950">
      {/* Server-rendered card that matches your theme */}
      <WorkOrderPreview woId={id ?? null} />
    </div>
  );
}