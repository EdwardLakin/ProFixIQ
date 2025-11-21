"use client";

import { useRouter, useParams } from "next/navigation";
import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";

export default function MobileJobPage() {
  const router = useRouter();
  const params = useParams<{ lineId: string }>();
  const lineId = params.lineId;

  return (
    <MobileFocusedJob
      workOrderLineId={lineId}
      onBack={() => {
        // Prefer going back, but if there's no history, go to WO list
        if (window.history.length > 1) router.back();
        else router.push("/mobile/work-orders");
      }}
    />
  );
}