// app/work-orders/preview/[id]/page.tsx
import WorkOrderPreview from "app/work-orders/components/WorkOrderPreview";

// Explicitly type `params` to match Next.js App Router expectations
interface PreviewPageProps {
  params: { id: string };
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const id = params?.id ?? null;

  return (
    <div className="p-4 bg-neutral-950 min-h-screen">
      {/* Server-rendered card that matches your theme */}
      <WorkOrderPreview woId={id} />
    </div>
  );
}