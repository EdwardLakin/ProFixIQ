// @ts-nocheck
import WorkOrderIdClient from "./Client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function WorkOrderIdPage({ params }) {
  return <WorkOrderIdClient routeId={params.id} userId={null} />;
}