// app/work-orders/[id]/page.tsx  (SERVER FILE)
export const dynamic = "force-dynamic";
export const revalidate = 0;

import WorkOrderIdPage from "@/features/work-orders/app/work-orders/[id]/page";

// Do NOT pass functions across this boundary.
// Primitives (params/searchParams) are fine if needed.
export default function Page() {
  return <WorkOrderIdPage />;
}