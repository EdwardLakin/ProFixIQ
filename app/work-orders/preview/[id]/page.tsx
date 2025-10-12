// app/work-orders/preview/[id]/page.tsx
import WorkOrderPreview from "app/work-orders/components/WorkOrderPreview";

type PreviewPageProps = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function WorkOrderPreviewPage({ params }: PreviewPageProps) {
  const { id } = params;

  return (
    <div
      className="min-h-screen bg-neutral-950 p-6"
      style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-4xl rounded-lg border bg-neutral-950 p-5 shadow-xl"
           style={{ borderColor: "#f97316" /* orange */ }}>
        <h1
          className="mb-4 text-2xl text-orange-400"
          style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}
        >
          Work Order Preview
        </h1>

        <WorkOrderPreview woId={id} />
      </div>
    </div>
  );
}