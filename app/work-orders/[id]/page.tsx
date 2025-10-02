// app/work-orders/[id]/page.tsx
import WorkOrderIdClient from "./Client";

export default function WorkOrderIdPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <WorkOrderIdClient
      routeId={params.id}
      userId={null} // server can pass real user id later if needed
    />
  );
}