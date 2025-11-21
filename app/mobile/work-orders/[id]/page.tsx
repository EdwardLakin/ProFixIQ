// app/mobile/work-orders/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import MobileWorkOrderClient from "@/features/work-orders/mobile/MobileWorkOrderClient";

export default function MobileWorkOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return <MobileWorkOrderClient routeId={id} />;
}