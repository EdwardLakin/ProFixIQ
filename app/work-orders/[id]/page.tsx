// app/work-orders/[id]/page.tsx
import WorkOrderIdClient from "./Client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <WorkOrderIdClient />;
}