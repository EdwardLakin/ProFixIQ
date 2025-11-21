"use client";

import React from "react";
import { useRouter } from "next/navigation";
import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";

type Props = {
  params: { lineId: string };
};

export default function MobileJobPage({ params }: Props) {
  const router = useRouter();

  return (
    <MobileFocusedJob
      workOrderLineId={params.lineId}
      onBack={() => {
        // Prefer going back, but if there's no history, go to WO list
        if (window.history.length > 1) router.back();
        else router.push("/mobile/work-orders");
      }}
    />
  );
}