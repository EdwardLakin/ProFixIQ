import WorkOrderBoard from "@shared/components/workboard/WorkOrderBoard";
import { parseWorkOrderBoardStageFilter } from "@shared/lib/workboard/filters";

export default async function WorkOrderBoardPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawStage = Array.isArray(params?.stage) ? params?.stage[0] : params?.stage;
  const initialStage = parseWorkOrderBoardStageFilter(rawStage);
  return (
    <main className="min-h-screen px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-[1500px]">
        <WorkOrderBoard
          variant="shop"
          title="Shop work order board"
          subtitle="Read-only board for real-time workflow visibility across active work orders."
          hrefBuilder={(row) => `/work-orders/${row.work_order_id}`}
          initialStage={initialStage}
        />
      </div>
    </main>
  );
}
