// app/work-orders/[id]/page.tsx
import WorkOrderIdClient from "./Client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page({ params }: any) {
  const routeId =
    Array.isArray(params?.id) ? params.id[0] : (params?.id ?? "");

  return (
    <WorkOrderIdClient
      routeId={routeId}
      userId={null} // you can pass a real user id later if needed
    />
  );
}