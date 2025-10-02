import WorkOrderIdClient from "./Client";

export default function WorkOrderIdPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[]>;
}) {
  const woId = params.id;

  return (
    <WorkOrderIdClient
      routeId={woId}
      userId={null}            // (server can pass a real userId later)
      searchParams={searchParams}
    />
  );
}