// app/work-orders/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";

export default function WorkOrdersIndexRedirect() {
  // CHOOSE ONE default destination:
  // redirect("/work-orders/queue");
  // redirect("/work-orders/view");
  // redirect("/work-orders/create?autostart=1");
  redirect("/work-orders/queue");
}