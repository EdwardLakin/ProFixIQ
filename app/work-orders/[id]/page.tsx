import WorkOrderIdClient from "./Client";

export default function WorkOrderIdPage({
  params,
  searchParams,
}: {
  params: { id: string };
  // Allow undefined per key (what Next.js actually provides)
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const woId = params.id;

  return (
    <WorkOrderIdClient
      routeId={woId}
      userId={null}                 // (server can pass a real userId later)
      searchParams={searchParams}   // optional
    />
  );
}